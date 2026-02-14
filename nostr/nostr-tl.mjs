#!/usr/bin/env node
// nostr-tl — fetch timeline (kind:1) from relays
// Usage: nostr-tl [-n <number>] [--pubkey <hex>]
//   -n <number>   how many notes (default 20)
//   --pubkey <hex> filter by author pubkey

import { getRelays, getPriv, privToPub, nostrReq } from './lib.mjs';

let limit = 20;
let pubkey = null;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-n' && args[i + 1]) { limit = parseInt(args[++i]) || 20; }
  else if (args[i] === '--pubkey' && args[i + 1]) { pubkey = args[++i]; }
  else if (args[i] === '--me') {
    const priv = getPriv();
    pubkey = privToPub(priv);
  }
}

const filter = { kinds: [1], limit };
if (pubkey) filter.authors = [pubkey];

const relays = getRelays();
const events = await nostrReq(relays, [filter]);

for (const ev of events.slice(0, limit)) {
  const date = new Date(ev.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const author = ev.pubkey.slice(0, 12) + '…';
  console.log(`[${date}] ${author}`);
  console.log(ev.content);
  console.log('---');
}
