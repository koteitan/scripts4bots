---
name: nostr
description: Post, read, reply, quote, mention, and zap on Nostr via raw WebSocket scripts. Use when the user asks to post to Nostr, read Nostr timeline, reply/quote/mention on Nostr, or send zaps. Requires NOSTR_NSEC and NOSTR_RELAYS env vars.
---

# Nostr Scripts

Raw WebSocket Nostr client. No nostr-tools dependency.

## Env Setup
```bash
export NOSTR_NSEC="nsec1..."   # or hex privkey
export NOSTR_RELAYS="wss://r.kojira.io,wss://relay.damus.io,wss://yabu.me"
```

All commands accept hex or bech32 (npub/nevent/note) for IDs.

## Commands

Run from `scripts4bots/nostr/` (requires `npm install` first).

### Read timeline
```bash
node nostr-tl.mjs -n 10                    # latest 10
node nostr-tl.mjs --me                      # own posts
node nostr-tl.mjs --pubkey <npub1.../hex>   # specific user
```

### Post
```bash
node nostr-post.mjs "text"
node nostr-post.mjs --reply <nevent1.../hex> "reply text"
node nostr-post.mjs --quote <nevent1.../hex> "quote text"
node nostr-post.mjs --mention <npub1.../hex> "mention text"
```
Flags combinable: `--reply <id> --mention <npub> "text"`

### Generic REQ
```bash
node nostr-read.mjs '{"kinds":[1],"limit":5}'
```
Returns JSON array.

### Zap (NIP-57)
```bash
node nostr-zap.mjs --note <nevent1.../hex> --amount 21 --comment "⚡"
node nostr-zap.mjs --pubkey <npub1.../hex> --amount 100
```
Outputs Lightning invoice. Pay via `wallets/cashu.mjs pay` or `wallets/lnbits.mjs pay`.

## Library (`lib.mjs`)
- `nostr_read(relays, filters, opts)` — REQ until EOSE, returns deduplicated events
- `nostr_write(relays, event, opts)` — EVENT + wait OK
- `toHex(input)` — npub/nsec/note/nevent → hex
- `encodeNevent(id)` / `encodeNpub(pk)` — hex → bech32
- `signEvent(evt, privHex)` — sign kind event
