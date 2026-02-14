# nostr/ — Nostr scripts for bots

Raw WebSocket implementation. No nostr-tools dependency.

## Setup

```bash
cd nostr && npm install
export NOSTR_NSEC="nsec1..."
export NOSTR_RELAYS="wss://relay.damus.io,wss://nos.lol,wss://yabu.me"
```

## Commands

### nostr-read — generic REQ
```bash
node nostr-read.mjs '{"kinds":[1],"limit":5}'
node nostr-read.mjs '{"kinds":[0],"authors":["<pubkey-hex>"]}'
```
Returns JSON array of events (deduplicated, sorted by created_at desc).

### nostr-tl — timeline
```bash
node nostr-tl.mjs -n 10          # latest 10 notes from anyone
node nostr-tl.mjs --me            # my own notes
node nostr-tl.mjs --pubkey <hex>  # specific user's notes
```

### nostr-post — publish a note
```bash
node nostr-post.mjs "Hello from a bot 🤖"
```

## Dependencies

- `@noble/curves` — schnorr signing (secp256k1)
- `@noble/hashes` — sha256, hex utils
- `ws` — WebSocket client
