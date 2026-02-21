#!/usr/bin/env node
// nostr-post — kind:1 テキストノート投稿
// Usage:
//   nostr-post "Hello"                          普通の投稿
//   nostr-post --reply <event-id> "Hello"       リプライ
//   nostr-post --quote <event-id> "Hello"       引用リポスト
//   nostr-post --mention <pubkey-hex> "Hello"   メンション
//   組み合わせ可: --reply <id> --mention <pk> "text"

import { getRelays, getPriv, privToPub, signEvent, nostr_write, nostr_read, encodeNevent, toHex } from './lib.mjs';

let replyTo = null, quoteId = null;
const mentions = [];
const textParts = [];

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--reply' && args[i + 1]) { replyTo = toHex(args[++i]); }
  else if (args[i] === '--quote' && args[i + 1]) { quoteId = toHex(args[++i]); }
  else if (args[i] === '--mention' && args[i + 1]) { mentions.push(toHex(args[++i])); }
  else { textParts.push(args[i]); }
}

let text = textParts.join(' ');
if (!text && !quoteId) { console.error('Usage: nostr-post [--reply <id>] [--quote <id>] [--mention <pk>] "text"'); process.exit(1); }

const priv = getPriv();
const pub = privToPub(priv);
const relays = getRelays();
const tags = [];

// Reply: need root event's pubkey + tags
if (replyTo) {
  // Fetch the event to get its author and root
  const events = await nostr_read(relays, [{ ids: [replyTo] }]);
  if (events.length) {
    const ev = events[0];
    const rootTag = ev.tags.find(t => t[0] === 'e' && t[3] === 'root');
    if (rootTag) {
      // Replying to a reply: keep root, add reply marker
      tags.push(['e', rootTag[1], '', 'root']);
      tags.push(['e', replyTo, '', 'reply']);
    } else {
      // Replying to a root post
      tags.push(['e', replyTo, '', 'root']);
      tags.push(['e', replyTo, '', 'reply']);
    }
    tags.push(['p', ev.pubkey]);
  } else {
    // Couldn't fetch, best effort
    tags.push(['e', replyTo, '', 'root']);
    tags.push(['e', replyTo, '', 'reply']);
  }
}

// Quote: NIP-18 style — add q tag + nostr:nevent in content
if (quoteId) {
  tags.push(['q', quoteId]);
  // Append nostr:nevent1... bech32 reference
  const nevent = encodeNevent(quoteId);
  if (text) text += '\n';
  text += `nostr:${nevent}`;
}

// Mentions: add p tags
for (const pk of mentions) {
  tags.push(['p', pk]);
}

const event = signEvent({
  pubkey: pub,
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags,
  content: text,
}, priv);

console.log(`📝 Publishing to ${relays.length} relays...`);
console.log(`   id: ${event.id}`);
if (replyTo) console.log(`   ↩️  reply to: ${replyTo.slice(0, 16)}…`);
if (quoteId) console.log(`   📎 quote: ${quoteId.slice(0, 16)}…`);
if (mentions.length) console.log(`   👤 mentions: ${mentions.map(m => m.slice(0, 12) + '…').join(', ')}`);

const { ok, fail } = await nostr_write(relays, event);
if (ok.length) console.log(`✅ OK: ${ok.join(', ')}`);
if (fail.length) console.log(`❌ Fail: ${fail.join(', ')}`);
if (!ok.length && !fail.length) console.log('⚠️  No responses received');
