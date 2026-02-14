#!/usr/bin/env node
// nostr-tl — タイムライン取得
// Usage: nostr-tl [-n <number>] [--pubkey <hex>] [--me]
import { getRelays, getPriv, privToPub, nostr_read, toHex } from './lib.mjs';

let limit = 20;
let pubkey = null;
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-n' && args[i + 1]) { limit = parseInt(args[++i]) || 20; }
  else if (args[i] === '--pubkey' && args[i + 1]) { pubkey = toHex(args[++i]); }
  else if (args[i] === '--me') { pubkey = privToPub(getPriv()); }
}

const filter = { kinds: [1], limit };
if (pubkey) filter.authors = [pubkey];

const events = await nostr_read(getRelays(), [filter]);

for (const ev of events.slice(0, limit)) {
  const date = new Date(ev.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const author = ev.pubkey.slice(0, 12) + '…';
  console.log(`[${date}] ${author}`);
  console.log(ev.content);
  console.log('---');
}
