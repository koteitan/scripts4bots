#!/usr/bin/env node
// NIP-18 repost (kind 6)
// Usage: nostr-repost.mjs <nevent/note/hex>
import { getRelays, getPriv, privToPub, nostr_read, nostr_write, signEvent, toHex, encodeNevent } from './lib.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('Usage: nostr-repost.mjs <note-id>'); process.exit(1); }

const targetId = toHex(args[0]);
const relays = getRelays();
const priv = getPriv();

// fetch target event
const evts = await nostr_read(relays, [{ ids: [targetId], limit: 1 }], { timeoutMs: 8000 });
if (!evts.length) { console.error('Event not found'); process.exit(1); }
const target = evts[0];

const ev = signEvent({
  pubkey: privToPub(priv),
  kind: 6,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['e', targetId, relays[0] || ''],
    ['p', target.pubkey],
  ],
  content: JSON.stringify(target),
}, priv);

await nostr_write(relays, ev);
console.log(`Reposted ${encodeNevent(targetId).slice(0, 30)}…`);
