#!/usr/bin/env node
// nostr-tl — タイムライン取得
// Usage: nostr-tl [-n <number>] [--pubkey <hex>] [--me]
import { getRelays, getPriv, privToPub, nostr_read, toHex, getProfileInfo, formatDisplayLabel, encodeNpub } from './lib.mjs';

let limit = 20, pubkey = null, since = null, until = null, json = false;
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-n' && args[i + 1]) { limit = parseInt(args[++i]) || 20; }
  else if (args[i] === '--pubkey' && args[i + 1]) { pubkey = toHex(args[++i]); }
  else if (args[i] === '--me') { pubkey = privToPub(getPriv()); }
  else if (args[i] === '--since' && args[i + 1]) { const v = args[++i]; since = +v || Math.floor(new Date(v)/1000); }
  else if (args[i] === '--until' && args[i + 1]) { const v = args[++i]; until = +v || Math.floor(new Date(v)/1000); }
  else if (args[i] === '--json') json = true;
}

const relays = getRelays();
const filter = { kinds: [1], limit };
if (pubkey) filter.authors = [pubkey];
if (since) filter.since = since;
if (until) filter.until = until;

const events = await nostr_read(relays, [filter]);

const out = events.slice(0, limit);
if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const profiles = await Promise.all(
    out.map(ev => getProfileInfo(ev.pubkey, relays).catch(() => null))
  );
  for (let i = 0; i < out.length; i++) {
    const ev = out[i];
    const date = new Date(ev.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const npub = encodeNpub(ev.pubkey).slice(0, 16) + '…';
    const label = formatDisplayLabel(profiles[i]);
    const authorStr = label ? `${npub} ${label}` : npub;
    console.log(`[${date}] ${ev.id} ${authorStr}`);
    console.log(ev.content);
    console.log('---');
  }
}
