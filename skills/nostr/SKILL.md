# Nostr Skill

Post, read, reply, quote, mention, react, repost, search, and zap on Nostr via raw WebSocket scripts.

## When to use

Use when the user asks to:
- Post to Nostr (text, reply, quote, mention)
- Read Nostr timeline or specific events
- React or repost on Nostr
- Search Nostr posts
- Send zaps (NIP-57)
- Follow users or manage follows
- Create badges (NIP-58)

## Requirements

**方法1（推奨）：ワークスペースルートに `.env` を置く**

```bash
# ~/.openclaw/workspace/.env
NOSTR_NSEC_FILE=~/katte/nostr/nsec   # 秘密鍵ファイルのパス（NOSTR_NSECより安全）
NOSTR_RELAYS=wss://r.kojira.io,wss://relay.damus.io,...
```

lib.mjs が起動時に自動で読み込む（既存の環境変数・コマンドライン引数が優先）。
`.gitignore` に `.env` が追加済みなので git に含まれない。

**方法2：コマンドライン引数（ワークスペースなしのテスト等に）**

```bash
node check-replies.mjs --nsec nsec1... --relay "wss://relay.damus.io"
```

**方法3：環境変数（従来通り）**

```bash
export NOSTR_NSEC="nsec1..."
export NOSTR_RELAYS="wss://r.kojira.io,wss://relay.damus.io,..."
```

**優先順位:** コマンドライン引数 > 環境変数 > `.env` ファイル

## Setup

```bash
cd scripts
npm install
```

## Available Scripts

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
| `nostr-follow.mjs` | Follow/unfollow users | NIP-02 |
| `nostr-badge.mjs` | Create badges | NIP-58 |
| `lib.mjs` | Shared library (read/write/sign/bech32) | — |

## Usage Examples

### Timeline
```bash
cd scripts
node nostr-tl.mjs -n 20
node nostr-tl.mjs --since 1703275200 --pubkey npub1...
```

### Post
```bash
node nostr-post.mjs "Hello Nostr!"
```

### Reply
```bash
node nostr-post.mjs --reply note1... "Nice post!"
```

### React
```bash
node nostr-react.mjs note1... "🐳"
```

### Search
```bash
node nostr-search.mjs -n 10 "かってちゃん"
```

### Zap
```bash
node nostr-zap.mjs npub1... 1000 "Great work!"
```

## Notes

- All scripts use raw WebSocket connections (no nostr-tools dependency)
- Hex and bech32 formats are interchangeable
- Use `lib.mjs` for shared utilities (read/write/sign/bech32)
