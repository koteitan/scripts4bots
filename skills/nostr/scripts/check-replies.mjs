#!/usr/bin/env node
import { nostr_read, getPriv, privToPub, encodeNpub } from './lib.mjs';
import fs from 'fs';

// Show help before loading keys
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node check-replies.mjs [OPTIONS]

Check for Nostr replies addressed to you.

Options:
  --check-hist <file>  Path to reply history file (for deduplication & auto-since)
  --since <timestamp>  Only fetch events after this Unix timestamp
  --no-thread          Disable thread context display
  -h, --help           Show this help message

Environment variables:
  NOSTR_NSEC    Your Nostr private key (hex or nsec)
  NOSTR_RELAYS  Comma-separated list of relay URLs

Examples:
  node check-replies.mjs --check-hist ~/.openclaw/memory/nostr-replied.txt
  node check-replies.mjs --since 1700000000 --no-thread
`);
  process.exit(0);
}

const RELAYS = process.env.NOSTR_RELAYS?.split(',') || [];
const privHex = getPriv();
const myPubkey = privToPub(privHex);

// Parse remaining arguments
let checkHistFile = null;
let sinceTimestamp = null;
let noThread = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check-hist' && i + 1 < args.length) {
    checkHistFile = args[i + 1];
    i++;
  } else if (args[i] === '--since' && i + 1 < args.length) {
    sinceTimestamp = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--no-thread') {
    noThread = true;
  }
}

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

// Filter out replied events
const filteredEvents = events.filter(e => !repliedIds.has(e.id));

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

for (const event of filteredEvents.slice(0, 10)) {
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

// Update hist-file with current timestamp
if (checkHistFile) {
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
