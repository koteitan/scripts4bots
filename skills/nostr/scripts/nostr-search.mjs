#!/usr/bin/env node
// NIP-50 search — queries search-capable relays
import { nostr_read, toHex, encodeNpub, encodeNevent } from './lib.mjs';
import WebSocket from 'ws';

const DEFAULT_RELAY = 'wss://search.nos.today';

function usage() {
  console.error(`Usage: nostr-search.mjs [options] <query>
Options:
  -n <num>        max results (default 10)
  --relay <url>   search relay (default ${DEFAULT_RELAY})
  --pubkey <pk>   filter by author (hex/npub)
  --since <ts>    unix timestamp or ISO date
  --until <ts>    unix timestamp or ISO date
  --json          raw JSON output
  --hook          stay alive and notify Discord via webhook on new hits

Environment variables (for --hook):
  DISCORD_WEBHOOK_FOR_NOSTR_SEARCH  Discord Webhook URL`);
  process.exit(1);
}

const args = process.argv.slice(2);
let limit = 10, relay = DEFAULT_RELAY, pubkey, since, until, json = false, query, hookMode = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-n') limit = +args[++i];
  else if (args[i] === '--relay') relay = args[++i];
  else if (args[i] === '--pubkey') pubkey = toHex(args[++i]);
  else if (args[i] === '--since') { const v = args[++i]; since = +v || Math.floor(new Date(v)/1000); }
  else if (args[i] === '--until') { const v = args[++i]; until = +v || Math.floor(new Date(v)/1000); }
  else if (args[i] === '--json') json = true;
  else if (args[i] === '--hook') hookMode = true;
  else if (!query) query = args[i];
  else usage();
}
if (!query) usage();

if (hookMode) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_FOR_NOSTR_SEARCH;
  if (!webhookUrl) {
    console.error('Error: DISCORD_WEBHOOK_FOR_NOSTR_SEARCH not set.');
    process.exit(1);
  }

  console.error(`🪝 Hook mode started. Searching for "${query}" on ${relay}...`);
  const seenIds = new Set();

  function connectSearch() {
    let ws;
    try { ws = new WebSocket(relay); } catch (e) {
      console.error(`  Failed to connect: ${relay}. Retrying in 5s...`);
      setTimeout(connectSearch, 5000);
      return;
    }
    const subId = 'search-' + Math.random().toString(36).slice(2, 8);
    let reconnecting = false;

    function scheduleReconnect() {
      if (reconnecting) return;
      reconnecting = true;
      console.error(`  Reconnecting ${relay} in 5s...`);
      setTimeout(connectSearch, 5000);
    }

    ws.on('open', () => {
      const filter = { kinds: [1], search: query, limit: 0 };
      if (pubkey) filter.authors = [pubkey];
      ws.send(JSON.stringify(['REQ', subId, filter]));
      console.error(`  Connected: ${relay}`);
    });

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg[0] === 'EOSE' && msg[1] === subId) {
        // noop
      } else if (msg[0] === 'EVENT' && msg[1] === subId) {
        const event = msg[2];
        if (seenIds.has(event.id)) return;
        seenIds.add(event.id);
        const t = new Date(event.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19);
        const npub = encodeNpub(event.pubkey).slice(0, 16) + '…';
        const content = event.content.slice(0, 1000);
        const text = `🔍 **Nostr 検索ヒット**: "${query}"\n\n[${t}] ${npub}\n${content}`;
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text.slice(0, 2000), username: 'すしめいじ 🪄' })
          });
          console.error(`  Notified Discord: ${event.id.slice(0, 12)}...`);
        } catch (e) {
          console.error(`  Discord notification failed: ${e.message}`);
        }
      }
    });

    ws.on('close', scheduleReconnect);
    ws.on('error', scheduleReconnect);
  }

  connectSearch();
  // Keep process alive indefinitely
  await new Promise(() => {});
} else {
  const filter = { kinds: [1], search: query, limit };
  if (pubkey) filter.authors = [pubkey];
  if (since) filter.since = since;
  if (until) filter.until = until;

  const events = await nostr_read([relay], [filter], { timeoutMs: 10000 });

  if (json) {
    console.log(JSON.stringify(events, null, 2));
  } else {
    if (!events.length) { console.log('No results.'); process.exit(0); }
    for (const e of events) {
      const t = new Date(e.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19);
      const npub = encodeNpub(e.pubkey).slice(0, 16) + '…';
      console.log(`[${t}] ${npub}`);
      console.log(e.content.slice(0, 1000));
      console.log('---');
    }
  }
}
