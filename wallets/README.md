# wallets/ — Lightning wallet CLIs

汎用ウォレットインターフェース。全コマンドはJSON出力。

## Setup
```bash
cd wallets && npm install
```

## cashu — Cashu ecash wallet
```bash
export CASHU_MINT="https://mint.coinos.io"  # optional

node cashu.mjs balance              # → 9844
node cashu.mjs invoice 1000         # → {"invoice":"lnbc...","quoteId":"...","amount":1000}
node cashu.mjs claim <qid> 1000     # → {"claimed":1000,"balance":10844}
node cashu.mjs pay <invoice>        # → {"paid":true,"amount":21,"fee":2,"balance":9821}
node cashu.mjs send 100             # → {"token":"cashuA...","amount":100,"balance":9721}
node cashu.mjs receive <token>      # → {"received":100,"balance":9821}
```

## lnbits — LNbits Lightning wallet
```bash
export LNBITS_URL="https://demo.lnbits.com"
export LNBITS_ADMIN_KEY="..."
export LNBITS_INVOICE_KEY="..."

node lnbits.mjs balance             # → 10
node lnbits.mjs invoice 100         # → {"invoice":"lnbc...","hash":"...","amount":100}
node lnbits.mjs pay <invoice>       # → {"paid":true,"hash":"..."}
```

## nostr-zap integration
```bash
# Stage 1: Cashu → LNbits (short invoice, bypasses 1000-char limit)
# Stage 2: LNbits → zap invoice (no length limit)
```
