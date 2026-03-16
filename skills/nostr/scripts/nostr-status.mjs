#!/usr/bin/env node
// nostr-status — NIP-38 kind:30315 ユーザーステータス管理
// Usage:
//   nostr-status                          # 現在のステータスを取得して表示
//   nostr-status --hp 80/100 --mp 40/50   # HP/MPを設定して publish
//   nostr-status --text "作業中"           # 任意テキストを設定
//   nostr-status --clear                  # ステータスをクリア

import { nostr_read, nostr_write, getPriv, privToPub, signEvent } from './lib.mjs';

const RELAYS = (process.env.NOSTR_RELAYS || '').split(',').map(s => s.trim()).filter(Boolean);
if (!RELAYS.length) { console.error('NOSTR_RELAYS required'); process.exit(1); }

const privkey = getPriv();
const pubkey = privToPub(privkey);

// --- arg parse ---
const args = process.argv.slice(2);
let hp = null, mp = null, text = null, clear = false;
let getMode = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--hp' && args[i + 1]) { hp = args[++i]; continue; }
  if (args[i] === '--mp' && args[i + 1]) { mp = args[++i]; continue; }
  if (args[i] === '--text' && args[i + 1]) { text = args[++i]; continue; }
  if (args[i] === '--clear') { clear = true; continue; }
  if (args[i] === '--get') { getMode = true; continue; }
}

const isWrite = !getMode && (hp || mp || text !== null || clear);

if (!isWrite) {
  // 読み込みモード
  const events = await nostr_read(RELAYS, [{ kinds: [30315], authors: [pubkey], '#d': ['general'], limit: 1 }], { timeoutMs: 7000 });
  if (!events || events.length === 0) {
    console.log('(ステータス未設定)');
  } else {
    const e = events[0];
    console.log(`status: ${e.content || '(空)'}`);
    console.log(`updated: ${new Date(e.created_at * 1000).toISOString()}`);
  }
  process.exit(0);
}

// 書き込みモード
let content = '';
if (clear) {
  content = '';
} else {
  const parts = [];
  if (hp) parts.push(`HP:${hp}`);
  if (mp) parts.push(`MP:${mp}`);
  if (text) parts.push(text);
  content = parts.join(' ');
}

const event = signEvent({
  kind: 30315,
  pubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', 'general']],
  content,
});

console.log(`publishing: "${content}"`);
await nostr_write(RELAYS, event);
console.log('done.');
