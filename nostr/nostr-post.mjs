#!/usr/bin/env node
// nostr-post — kind:1 テキストノート投稿
// Usage: nostr-post "Hello Nostr!"
import { getRelays, getPriv, privToPub, signEvent, nostr_write } from './lib.mjs';

const text = process.argv.slice(2).join(' ');
if (!text) { console.error('Usage: nostr-post "your message"'); process.exit(1); }

const priv = getPriv();
const pub = privToPub(priv);
const relays = getRelays();

const event = signEvent({
  pubkey: pub,
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [],
  content: text,
}, priv);

console.log(`📝 Publishing to ${relays.length} relays...`);
console.log(`   id: ${event.id}`);

const { ok, fail } = await nostr_write(relays, event);
if (ok.length) console.log(`✅ OK: ${ok.join(', ')}`);
if (fail.length) console.log(`❌ Fail: ${fail.join(', ')}`);
if (!ok.length && !fail.length) console.log('⚠️  No responses received');
