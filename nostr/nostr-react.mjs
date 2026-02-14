#!/usr/bin/env node
// NIP-25 reaction
// Usage: nostr-react.mjs <nevent/note/hex> [emoji]   (default: +)
import { getRelays, getPriv, privToPub, nostr_read, nostr_write, signEvent, toHex, encodeNevent } from './lib.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('Usage: nostr-react.mjs <note-id> [emoji]'); process.exit(1); }

const targetId = toHex(args[0]);
const emoji = args[1] || '+';
const relays = getRelays();
const priv = getPriv();

// fetch target event to get author pubkey
const evts = await nostr_read(relays, [{ ids: [targetId], limit: 1 }], { timeoutMs: 8000 });
if (!evts.length) { console.error('Event not found'); process.exit(1); }
const target = evts[0];

const ev = signEvent({
  pubkey: privToPub(priv),
  kind: 7,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['e', targetId],
    ['p', target.pubkey],
  ],
  content: emoji,
}, priv);

await nostr_write(relays, ev);
console.log(`Reacted ${emoji} to ${encodeNevent(targetId).slice(0, 30)}…`);
