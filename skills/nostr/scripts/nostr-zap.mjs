#!/usr/bin/env node
// nostr-zap — NIP-57 zap (投稿 or ユーザーに zap)
// Usage:
//   nostr-zap --note <event-id> --amount <sats> [--comment "msg"]
//   nostr-zap --pubkey <hex> --amount <sats> [--comment "msg"]
//
// 流れ (NIP-57):
//   1. 対象の kind:0 プロフィールから lud16/lud06 (Lightning Address) を取得
//   2. LNURL pay endpoint に kind:9734 zap request を送る
//   3. 返ってきた Lightning invoice を表示（支払いは手動 or 別ツール）

import { getRelays, getPriv, privToPub, signEvent, nostr_read, toHex } from './lib.mjs';

// ── parse args ───────────────────────────────────────────────
let noteId = null, pubkey = null, amount = null, comment = '';
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--note' && args[i + 1]) noteId = toHex(args[++i]);
  else if (args[i] === '--pubkey' && args[i + 1]) pubkey = toHex(args[++i]);
  else if (args[i] === '--amount' && args[i + 1]) amount = parseInt(args[++i]);
  else if (args[i] === '--comment' && args[i + 1]) comment = args[++i];
}

if (!amount || amount <= 0) {
  console.error('Usage: nostr-zap --note <id> --amount <sats> [--comment "msg"]');
  console.error('       nostr-zap --pubkey <hex> --amount <sats> [--comment "msg"]');
  process.exit(1);
}
if (!noteId && !pubkey) {
  console.error('Error: specify --note <event-id> or --pubkey <hex>');
  process.exit(1);
}

const priv = getPriv();
const myPub = privToPub(priv);
const relays = getRelays();

// ── step 1: resolve target pubkey (from note if needed) ─────
if (noteId && !pubkey) {
  console.log(`🔍 Looking up note ${noteId.slice(0, 12)}…`);
  const events = await nostr_read(relays, [{ ids: [noteId] }]);
  if (!events.length) { console.error('❌ Note not found'); process.exit(1); }
  pubkey = events[0].pubkey;
}

// ── step 2: get kind:0 profile → lud16 / lud06 ─────────────
console.log(`🔍 Fetching profile for ${pubkey.slice(0, 12)}…`);
const profiles = await nostr_read(relays, [{ kinds: [0], authors: [pubkey], limit: 1 }]);
if (!profiles.length) { console.error('❌ Profile not found'); process.exit(1); }

let profile;
try { profile = JSON.parse(profiles[0].content); } catch {
  console.error('❌ Could not parse profile'); process.exit(1);
}

const lud16 = profile.lud16;
const lud06 = profile.lud06;

if (!lud16 && !lud06) {
  console.error('❌ No Lightning address (lud16/lud06) in profile');
  process.exit(1);
}

// ── step 3: resolve LNURL pay endpoint ──────────────────────
let lnurlPayUrl;
if (lud16) {
  // user@domain → https://domain/.well-known/lnurlp/user
  const [user, domain] = lud16.split('@');
  lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${user}`;
} else {
  // lud06 is a bech32-encoded URL (lnurl1...)
  const decoded = new TextDecoder().decode(
    (() => { // bech32 decode lnurl
      const pos = lud06.lastIndexOf('1');
      const data = [];
      const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
      for (let i = pos + 1; i < lud06.length; i++) {
        const v = charset.indexOf(lud06[i]); if (v === -1) break; data.push(v);
      }
      const words = data.slice(0, -6);
      let acc = 0, bits = 0; const out = [];
      for (const v of words) { acc = (acc << 5) | v; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } }
      return new Uint8Array(out);
    })()
  );
  lnurlPayUrl = decoded;
}

console.log(`⚡ LNURL endpoint: ${lnurlPayUrl}`);
const payRes = await fetch(lnurlPayUrl);
const payData = await payRes.json();

if (payData.status === 'ERROR') {
  console.error(`❌ LNURL error: ${payData.reason}`); process.exit(1);
}

const minSendable = payData.minSendable || 1000;   // millisats
const maxSendable = payData.maxSendable || 1e12;
const amountMsat = amount * 1000;

if (amountMsat < minSendable || amountMsat > maxSendable) {
  console.error(`❌ Amount out of range: ${minSendable / 1000}-${maxSendable / 1000} sats`);
  process.exit(1);
}

const allowsNostr = payData.allowsNostr;
const nostrPubkey = payData.nostrPubkey;

if (!allowsNostr) {
  console.error('⚠️  This endpoint does not support NIP-57 zaps. Requesting plain invoice instead.');
}

// ── step 4: build kind:9734 zap request ─────────────────────
// Use only 1 relay in zap request to keep invoice short
const zapTags = [
  ['relays', relays[0]],
  ['amount', String(amountMsat)],
  ['p', pubkey],
];
if (noteId) zapTags.push(['e', noteId]);

const zapRequest = signEvent({
  pubkey: myPub,
  created_at: Math.floor(Date.now() / 1000),
  kind: 9734,
  tags: zapTags,
  content: comment,
}, priv);

// ── step 5: request invoice from callback ───────────────────
const callbackUrl = new URL(payData.callback);
callbackUrl.searchParams.set('amount', String(amountMsat));
if (allowsNostr) {
  callbackUrl.searchParams.set('nostr', JSON.stringify(zapRequest));
}
if (comment && payData.commentAllowed) {
  callbackUrl.searchParams.set('comment', comment);
}

console.log(`💸 Requesting invoice for ${amount} sats...`);
const invoiceRes = await fetch(callbackUrl.toString());
const invoiceData = await invoiceRes.json();

if (invoiceData.status === 'ERROR') {
  console.error(`❌ Invoice error: ${invoiceData.reason}`); process.exit(1);
}

const invoice = invoiceData.pr;
if (!invoice) {
  console.error('❌ No invoice returned'); process.exit(1);
}

console.log(`\n⚡ Lightning Invoice (${amount} sats):`);
console.log(invoice);
console.log(`\nPay this invoice to complete the zap! 🥜`);
