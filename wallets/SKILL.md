---
name: lightning-wallets
description: Pay and receive Lightning invoices via Cashu ecash or LNbits wallets. Use when the user asks to pay a Lightning invoice, check wallet balance, send/receive sats, or fund wallets. Supports Cashu melt/mint and LNbits API.
---

# Lightning Wallets

CLI wallets with JSON output. Run from `scripts4bots/wallets/` (requires `npm install`).

## Cashu (`cashu.mjs`)
```bash
export CASHU_MINT="https://mint.coinos.io"  # optional

node cashu.mjs balance                       # → 9844
node cashu.mjs pay <invoice>                 # → {"paid":true,"amount":21,"fee":2,"balance":9821}
node cashu.mjs invoice <amount>              # → {"invoice":"lnbc...","quoteId":"..."}
node cashu.mjs claim <quoteId> <amount>      # → {"claimed":1000,"balance":10844}
node cashu.mjs send <amount>                 # → {"token":"cashuA...","balance":9721}
node cashu.mjs receive <token>               # → {"received":100,"balance":9821}
```

**Note:** Cashu mints have a 1000-char invoice limit. For long invoices (NIP-57 zaps), use LNbits as relay.

## LNbits (`lnbits.mjs`)
```bash
export LNBITS_URL="https://demo.lnbits.com"
export LNBITS_ADMIN_KEY="..."
export LNBITS_INVOICE_KEY="..."

node lnbits.mjs balance                      # → 10
node lnbits.mjs pay <invoice>                # → {"paid":true,"hash":"..."}
node lnbits.mjs invoice <amount> [memo]      # → {"invoice":"lnbc...","hash":"..."}
```

## Zap Payment Flow (long invoices)
1. `lnbits.mjs invoice <amount+buffer>` → short invoice
2. `cashu.mjs pay <short-invoice>` → fund LNbits
3. `lnbits.mjs pay <long-zap-invoice>` → pay zap
