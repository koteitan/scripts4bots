# nostr/ — Nostr scripts for bots

Raw WebSocket implementation. No nostr-tools.

## Setup

```bash
cd nostr && npm install
export NOSTR_NSEC="nsec1..."
export NOSTR_RELAYS="wss://relay.damus.io,wss://nos.lol,wss://yabu.me"
```

## Library (`lib.mjs`)

- `nostr_read(relays, filters, opts)` — 汎用REQ。全リレーにREQ送信、EOSE受信まで収集。重複排除、created_at desc。
- `nostr_write(relays, event, opts)` — 汎用EVENT発行。全リレーにEVENT送信、OKレスポンス待ち。
- `getRelays()` / `getPriv()` — 環境変数ヘルパー
- `signEvent(evt, privHex)` — イベント署名
- `privToPub(privHex)` / `nsecToHex(nsec)` — 鍵変換

## Scripts

### nostr-read — 汎用REQ (CLI)
```bash
node nostr-read.mjs '{"kinds":[1],"limit":5}'
node nostr-read.mjs '{"kinds":[0],"authors":["<pubkey>"]}'
```

### nostr-tl — タイムライン取得
```bash
node nostr-tl.mjs -n 10          # 最新10件
node nostr-tl.mjs --me            # 自分の投稿
node nostr-tl.mjs --pubkey <hex>  # 特定ユーザー
```

### nostr-post — テキストノート投稿
```bash
node nostr-post.mjs "Hello Nostr! 🤖"
```

### nostr-zap — Zap (NIP-57)
```bash
# 特定ユーザーに zap
node nostr-zap.mjs --pubkey <hex> --amount 100 --comment "⚡"

# 特定投稿に zap
node nostr-zap.mjs --note <event-id> --amount 100 --comment "good post"
```
Lightningインボイスを出力。支払いは手動または別ツール。

## Dependencies

- `@noble/curves` — schnorr (secp256k1)
- `@noble/hashes` — sha256
- `ws` — WebSocket
