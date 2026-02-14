# scripts4bots

Nostr & Lightning scripts for bot use. Raw WebSocket, no nostr-tools.

## Setup

```bash
npm install          # run in both nostr/ and wallets/
```

### Environment

```bash
export NOSTR_NSEC="nsec1..."
export NOSTR_RELAYS="wss://r.kojira.io,wss://relay.damus.io,wss://relay-jp.nostr.wirednet.jp,wss://yabu.me"
export CASHU_MINT="https://mint.coinos.io"
export LNBITS_URL="https://demo.lnbits.com"
export LNBITS_ADMIN_KEY="..."
export LNBITS_INVOICE_KEY="..."
```

## Nostr (`nostr/`)

All commands accept hex or bech32 (npub/nsec/note/nevent).

| Script | Description | NIP |
|--------|-------------|-----|
| `nostr-tl.mjs` | Timeline (with `--since/--until/--pubkey/--me`) | — |
| `nostr-post.mjs` | Post, reply, quote, mention | — |
| `nostr-read.mjs` | Generic REQ (JSON filter) | — |
| `nostr-react.mjs` | Reaction (emoji) | NIP-25 |
| `nostr-repost.mjs` | Repost | NIP-18 |
| `nostr-search.mjs` | Full-text search | NIP-50 |
| `nostr-zap.mjs` | Zap request → Lightning invoice | NIP-57 |
| `lib.mjs` | Shared library (read/write/sign/bech32) | — |

## Wallets (`wallets/`)

JSON output for easy piping.

| Script | Description |
|--------|-------------|
| `cashu.mjs` | Cashu ecash (balance/pay/invoice/claim/send/receive) |
| `lnbits.mjs` | LNbits (balance/pay/invoice) |

### Zap Payment Flow

Cashu mints have a ~1000 char invoice limit. NIP-57 zap invoices are ~1400 chars. Workaround:

1. `lnbits.mjs invoice <amount+10>` → short invoice
2. `cashu.mjs pay <short-invoice>` → fund LNbits
3. `lnbits.mjs pay <long-zap-invoice>` → pay zap

## OpenClaw Skills

Both `nostr/SKILL.md` and `wallets/SKILL.md` are OpenClaw-compatible skill definitions.

## License

MIT
