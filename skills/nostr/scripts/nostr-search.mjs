#!/usr/bin/env node
// NIP-50 search — queries search-capable relays
import { nostr_read, toHex, encodeNpub, encodeNevent } from './lib.mjs';

const DEFAULT_RELAY = 'wss://search.nos.today';

function usage() {
  console.error(`Usage: nostr-search.mjs [options] <query>
Options:
  -n <num>        max results (default 10)
  --relay <url>   search relay (default ${DEFAULT_RELAY})
  --pubkey <pk>   filter by author (hex/npub)
  --since <ts>    unix timestamp or ISO date
  --until <ts>    unix timestamp or ISO date
  --json          raw JSON output`);
  process.exit(1);
}

const args = process.argv.slice(2);
let limit = 10, relay = DEFAULT_RELAY, pubkey, since, until, json = false, query;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-n') limit = +args[++i];
  else if (args[i] === '--relay') relay = args[++i];
  else if (args[i] === '--pubkey') pubkey = toHex(args[++i]);
  else if (args[i] === '--since') { const v = args[++i]; since = +v || Math.floor(new Date(v)/1000); }
  else if (args[i] === '--until') { const v = args[++i]; until = +v || Math.floor(new Date(v)/1000); }
  else if (args[i] === '--json') json = true;
  else if (!query) query = args[i];
  else usage();
}
if (!query) usage();

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
    console.log(e.content.slice(0, 300));
    console.log('---');
  }
}
