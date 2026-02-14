# nostr/ — Nostr scripts for bots

Raw WebSocket. No nostr-tools.

## Setup
```bash
cd nostr && npm install
export NOSTR_NSEC="nsec1..."  # or hex
export NOSTR_RELAYS="wss://r.kojira.io,wss://relay.damus.io,wss://yabu.me"
```

All commands accept both **hex** and **bech32** (npub/nsec/note/nevent) for IDs and pubkeys.

## Library (`lib.mjs`)

**Functions:**
- `nostr_read(relays, filters, opts)` — 汎用REQ。EOSE受信まで収集。重複排除、created_at desc
- `nostr_write(relays, event, opts)` — 汎用EVENT発行。OKレスポンス待ち
- `toHex(input)` — npub/nsec/note/nevent/hex → hex 変換
- `encodeNevent(id, relays?, author?)` — hex → nevent1... bech32
- `encodeNpub(pubkey)` — hex → npub1...
- `signEvent(evt, privHex)` — イベント署名
- `getRelays()` / `getPriv()` — 環境変数ヘルパー

## Scripts

### nostr-read — 汎用REQ (CLI)
```bash
node nostr-read.mjs '{"kinds":[1],"limit":5}'
node nostr-read.mjs '{"kinds":[0],"authors":["<pubkey-or-npub>"]}'
```
JSON配列出力。

### nostr-tl — タイムライン取得
```bash
node nostr-tl.mjs -n 10
node nostr-tl.mjs --me
node nostr-tl.mjs --pubkey npub1...
```

### nostr-post — テキストノート投稿
```bash
node nostr-post.mjs "Hello Nostr!"
node nostr-post.mjs --reply <nevent1.../hex> "リプライ"
node nostr-post.mjs --quote <nevent1.../hex> "引用"
node nostr-post.mjs --mention <npub1.../hex> "メンション"
node nostr-post.mjs --reply <id> --mention <npub> "組み合わせ"
```

### nostr-zap — Zap (NIP-57)
```bash
node nostr-zap.mjs --pubkey <npub1.../hex> --amount 100 --comment "⚡"
node nostr-zap.mjs --note <nevent1.../hex> --amount 21
```
Lightningインボイス出力。支払いは `wallets/` を使用。

## Dependencies
- `@noble/curves` — schnorr (secp256k1)
- `@noble/hashes` — sha256
- `ws` — WebSocket
