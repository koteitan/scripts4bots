#!/usr/bin/env node
import { nostr_read, getPriv, privToPub, encodeNpub, toHex } from './lib.mjs';
import WebSocket from 'ws';
import fs from 'fs';

// Show help before loading keys
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node check-replies.mjs [OPTIONS]

Check for Nostr replies addressed to you.

Options:
  --check-hist <file>          Path to reply history file (for deduplication & auto-since)
  --since <timestamp>          Only fetch events after this Unix timestamp
  --no-thread                  Disable thread context display
  --npub <npub>                Check replies for this npub (read-only, no NOSTR_NSEC needed)
  --hook                       Stay alive and notify Discord via webhook on new replies
  --ignore-pubkeys <hex,...>   Comma-separated hex pubkeys (or npubs) to treat as known bots
  -h, --help                   Show this help message

Spam/Loop filters (applied in both hook and normal mode):
  - Self-reply filter:  events from your own pubkey are always skipped
  - Bot+depth filter:   if a thread contains a known bot pubkey (via --ignore-pubkeys or
                        NOSTR_HOOK_IGNORE_PUBKEYS) and the event's thread index >= 5, skip
  - Account age filter: accounts with kind:0 created within 5 days are skipped;
                        accounts with no kind:0 are treated as new and skipped

Environment variables:
  NOSTR_NSEC                       Your Nostr private key (hex or nsec) — not required with --npub
  NOSTR_RELAYS                     Comma-separated list of relay URLs
  DISCORD_HOOK_FOR_NOSTR_REPLY     Discord Webhook URL (required with --hook)
  NOSTR_HOOK_IGNORE_PUBKEYS        Comma-separated hex pubkeys (or npubs) of known bots

Examples:
  node check-replies.mjs --check-hist ~/.openclaw/memory/nostr-replied.txt
  node check-replies.mjs --since 1700000000 --no-thread
  node check-replies.mjs --npub npub1xxx... --since 1700000000
  node check-replies.mjs --hook
  node check-replies.mjs --hook --ignore-pubkeys hex1,hex2
`);
  process.exit(0);
}

const RELAYS = process.env.NOSTR_RELAYS?.split(',') || [];

// Parse remaining arguments
let checkHistFile = null;
let sinceTimestamp = null;
let noThread = false;
let npubOpt = null;
let hookMode = false;
let ignorePubkeysArg = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check-hist' && i + 1 < args.length) {
    checkHistFile = args[i + 1];
    i++;
  } else if (args[i] === '--since' && i + 1 < args.length) {
    sinceTimestamp = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--no-thread') {
    noThread = true;
  } else if (args[i] === '--npub' && i + 1 < args.length) {
    npubOpt = args[i + 1];
    i++;
  } else if (args[i] === '--hook') {
    hookMode = true;
  } else if (args[i] === '--ignore-pubkeys' && i + 1 < args.length) {
    ignorePubkeysArg = args[i + 1];
    i++;
  }
}

// Build ignorePubkeys set (merge CLI arg and env var)
const ignorePubkeys = new Set(
  [ignorePubkeysArg, process.env.NOSTR_HOOK_IGNORE_PUBKEYS || '']
    .join(',')
    .split(',')
    .map(s => s.split(/\s+#/)[0].trim())
    .filter(Boolean)
    .map(s => { try { return toHex(s); } catch { return s; } })
);

// Resolve pubkey: --npub takes priority, otherwise use NOSTR_NSEC
let myPubkey;
if (npubOpt) {
  myPubkey = toHex(npubOpt);
} else {
  const privHex = getPriv();
  myPubkey = privToPub(privHex);
}

// Helper: get root event ID from e tags (NIP-10)
function getRootId(event) {
  const eTags = event.tags.filter(t => t[0] === 'e');
  // Look for 'root' marker
  const rootTag = eTags.find(t => t[3] === 'root');
  if (rootTag) return rootTag[1];
  // Fallback: first e tag
  if (eTags.length > 0) return eTags[0][1];
  return null;
}

// Helper: fetch thread context
async function fetchThread(rootId, currentEventId) {
  try {
    // Fetch events that reference the root (the thread), and the root itself
    const [threadEvents, rootEvents] = await Promise.all([
      nostr_read(RELAYS, [{ '#e': [rootId], kinds: [1] }]),
      nostr_read(RELAYS, [{ ids: [rootId], kinds: [1] }])
    ]);
    const allEvents = [...rootEvents, ...threadEvents];

    // Deduplicate by id
    const seen = new Set();
    const unique = allEvents.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    // Sort by created_at ascending
    unique.sort((a, b) => a.created_at - b.created_at);

    // Limit to last 10 events (including current)
    return unique.length > 10 ? unique.slice(-10) : unique;
  } catch {
    return null;
  }
}

// Filter: skip if thread contains a known bot and current event's thread index >= 5
async function shouldIgnoreDueToBot(event) {
  if (ignorePubkeys.size === 0) return false;
  const rootId = getRootId(event);
  if (!rootId) return false;
  const threadEvents = await fetchThread(rootId, event.id);
  if (!threadEvents) return false;
  const hasBot = threadEvents.some(e => ignorePubkeys.has(e.pubkey));
  if (!hasBot) return false;
  const idx = threadEvents.findIndex(e => e.id === event.id);
  return idx >= 5;
}

// Filter: skip if account kind:0 created within 5 days (or no kind:0)
async function isAccountTooNew(pubkeyHex) {
  const FIVE_DAYS = 5 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  try {
    const profileEvents = await nostr_read(RELAYS, [{ kinds: [0], authors: [pubkeyHex], limit: 1 }]);
    if (profileEvents.length === 0) return true; // kind:0なし = 新規扱い
    return (now - profileEvents[0].created_at) < FIVE_DAYS;
  } catch {
    return false; // エラー時は通知する（false-negative側に倒す）
  }
}

// Build and send Discord notification for a reply event
async function notifyDiscordReply(event, webhookUrl) {
  const date = new Date(event.created_at * 1000).toISOString();
  const shortId = event.id.slice(0, 12);
  const content = event.content.slice(0, 1000);
  let text = `🔔 **Nostr リプライ**\n\n[${date}] ${shortId}...\n${content}`;

  if (!noThread) {
    const rootId = getRootId(event);
    if (rootId) {
      const threadEvents = await fetchThread(rootId, event.id);
      if (threadEvents && threadEvents.length > 0) {
        text += '\n\n🧵 スレッド:';
        for (const te of threadEvents) {
          const teDate = new Date(te.created_at * 1000).toISOString().replace('T', ' ').slice(0, 16);
          const teNpub = encodeNpub(te.pubkey).slice(0, 16) + '…';
          const teContent = te.content.replace(/\n/g, ' ').slice(0, 100);
          const isCurrentEvent = te.id === event.id;
          const prefix = isCurrentEvent ? '  └→' : '    ';
          const suffix = isCurrentEvent ? ' ← 今回のリプライ' : '';
          text += `\n${prefix} [${teDate}] ${teNpub}: ${teContent}${suffix}`;
        }
      }
    }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.slice(0, 2000), username: 'すしめいじ 🪄' })
    });
    console.error(`  Notified Discord: ${event.id.slice(0, 12)}... (HTTP ${res.status})`);
    if (!res.ok) console.error(`  Response: ${await res.text()}`);
  } catch (e) {
    console.error(`  Discord notification failed: ${e.message}`);
  }
}

// Hook mode: stay alive and notify Discord on new replies
async function startHookMode(relays, pubkey, webhookUrl) {
  console.error(`🪝 Hook mode started. Listening for replies on ${relays.length} relay(s)...`);
  const seenIds = new Set();

  function connectRelay(url) {
    let ws;
    try { ws = new WebSocket(url); } catch (e) {
      console.error(`  Failed to connect: ${url}. Retrying in 5s...`);
      setTimeout(() => connectRelay(url), 5000);
      return;
    }
    const subId = 'hook-' + Math.random().toString(36).slice(2, 8);
    let reconnecting = false;

    function scheduleReconnect() {
      if (reconnecting) return;
      reconnecting = true;
      console.error(`  Reconnecting ${url} in 5s...`);
      setTimeout(() => connectRelay(url), 5000);
    }

    ws.on('open', () => {
      const filter = { kinds: [1], '#p': [pubkey], since: Math.floor(Date.now() / 1000) };
      ws.send(JSON.stringify(['REQ', subId, filter]));
      console.error(`  Connected: ${url}`);
    });

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg[0] === 'EOSE' && msg[1] === subId) {
        console.error(`  EOSE received: ${url}`);
      } else if (msg[0] === 'EVENT' && msg[1] === subId) {
        const event = msg[2];
        if (seenIds.has(event.id)) { console.error(`  [dup] ${event.id.slice(0,12)}`); return; }
        seenIds.add(event.id);
        console.error(`  [event] id=${event.id.slice(0,12)} pubkey=${event.pubkey.slice(0,12)} self=${event.pubkey === myPubkey}`);
        if (event.pubkey === myPubkey) return;
        const [botIgnore, tooNew] = await Promise.all([
          shouldIgnoreDueToBot(event),
          isAccountTooNew(event.pubkey)
        ]);
        console.error(`  [filter] botIgnore=${botIgnore} tooNew=${tooNew}`);
        if (botIgnore || tooNew) {
          console.error(`  [filtered] ${event.id.slice(0, 12)} pubkey=${event.pubkey.slice(0, 12)}`);
          return;
        }
        console.error(`  [notify] ${event.id.slice(0,12)}`);
        await notifyDiscordReply(event, webhookUrl);
      }
    });

    ws.on('close', scheduleReconnect);
    ws.on('error', scheduleReconnect);
  }

  for (const url of relays) {
    connectRelay(url);
  }

  // Keep process alive indefinitely
  await new Promise(() => {});
}

if (hookMode) {
  const webhookUrl = process.env.DISCORD_HOOK_FOR_NOSTR_REPLY;
  if (!webhookUrl) {
    console.error('Error: DISCORD_HOOK_FOR_NOSTR_REPLY not set.');
    process.exit(1);
  }
  await startHookMode(RELAYS, myPubkey, webhookUrl);
} else {
  // Read hist-file if provided
  let repliedIds = new Set();
  if (checkHistFile) {
    if (fs.existsSync(checkHistFile)) {
      const lines = fs.readFileSync(checkHistFile, 'utf-8').split('\n');
      for (const line of lines) {
        if (line.startsWith('# Last check:')) {
          const timestamp = parseInt(line.split(':')[1].trim());
          if (!isNaN(timestamp) && !sinceTimestamp) {
            sinceTimestamp = timestamp;
          }
        } else if (line && !line.startsWith('#')) {
          repliedIds.add(line.trim());
        }
      }
    }
  }

  // Build filter
  const filter = { kinds: [1], '#p': [myPubkey], limit: 50 };
  if (sinceTimestamp) {
    filter.since = sinceTimestamp;
  }

  const events = await nostr_read(RELAYS, [filter]);

  // Filter out replied events and self-events
  const filteredEvents = events.filter(e => !repliedIds.has(e.id) && e.pubkey !== myPubkey);

  for (const event of filteredEvents.slice(0, 10)) {
    const [botIgnore, tooNew] = await Promise.all([
      shouldIgnoreDueToBot(event),
      isAccountTooNew(event.pubkey)
    ]);
    if (botIgnore || tooNew) {
      console.log(`[filtered] ${event.id.slice(0, 12)}... (botIgnore=${botIgnore}, tooNew=${tooNew})`);
      continue;
    }

    const date = new Date(event.created_at * 1000).toISOString();
    const shortId = event.id.slice(0, 12);
    const content = event.content.replace(/\n/g, ' ').slice(0, 1000);
    console.log(`[${date}] ${shortId}… ${content}`);

    if (!noThread) {
      const rootId = getRootId(event);
      if (rootId) {
        const threadEvents = await fetchThread(rootId, event.id);
        if (threadEvents && threadEvents.length > 0) {
          console.log(`\n  🧵 スレッド:`);
          for (const te of threadEvents) {
            const teDate = new Date(te.created_at * 1000).toISOString().replace('T', ' ').slice(0, 16);
            const teNpub = encodeNpub(te.pubkey).slice(0, 16) + '…';
            const teContent = te.content.replace(/\n/g, ' ').slice(0, 100);
            const isCurrentEvent = te.id === event.id;
            const prefix = isCurrentEvent ? '  └→' : '    ';
            const suffix = isCurrentEvent ? ' ← 今回のリプライ' : '';
            console.log(`${prefix} [${teDate}] ${teNpub}: ${teContent}${suffix}`);
          }
          console.log('');
        }
      }
    }
  }

  // Update hist-file with current timestamp (skipped in read-only --npub mode)
  if (checkHistFile && !npubOpt) {
    const now = Math.floor(Date.now() / 1000);
    let lines;

    if (fs.existsSync(checkHistFile)) {
      // Existing hist-file
      lines = fs.readFileSync(checkHistFile, 'utf-8').split('\n');
    } else {
      // First-time creation: fetch past replies to populate replied IDs
      console.error('🔍 First run: fetching past replies to initialize hist-file...');
      const myPosts = await nostr_read(RELAYS, [{
        kinds: [1],
        authors: [myPubkey],
        limit: 100
      }]);

      // Extract all e tags (replied-to event IDs)
      const pastRepliedIds = new Set();
      for (const post of myPosts) {
        for (const tag of post.tags) {
          if (tag[0] === 'e' && tag[1]) {
            pastRepliedIds.add(tag[1]);
          }
        }
      }

      console.error(`📝 Found ${pastRepliedIds.size} past replied event IDs`);

      // Initialize lines with header and past replied IDs
      lines = ['# replied IDs:', ''];
      for (const id of pastRepliedIds) {
        lines.push(id);
      }
    }

    // Update or add "Last check" line
    let updated = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('# Last check:')) {
        lines[i] = `# Last check: ${now}`;
        updated = true;
        break;
      }
    }

    if (!updated) {
      lines.unshift(`# Last check: ${now}`);
    }

    fs.writeFileSync(checkHistFile, lines.join('\n'));
  }
}
