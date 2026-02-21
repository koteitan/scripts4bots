---
name: lightning-wallets
description: Pay and receive Lightning invoices via Cashu ecash or LNbits wallets. Use when the user asks to pay a Lightning invoice, check wallet balance, send/receive sats, or fund wallets. Supports Cashu melt/mint and LNbits API.
---

# Lightning Wallets

CLI wallets with JSON output. Run from `scripts/` directory (requires `npm install`).

## Environment Variables

```bash
export CASHU_MINT="https://mint.coinos.io"         # optional, default mint
export CASHU_DATA="~/.cashu/data.json"              # optional, default data path
export LNBITS_URL="https://demo.lnbits.com"
export LNBITS_ADMIN_KEY="..."
export LNBITS_INVOICE_KEY="..."
```

## Scripts

### Cashu (`scripts/cashu.mjs`)

Cashu ecash wallet operations.

```bash
node scripts/cashu.mjs balance                       # → 9844
node scripts/cashu.mjs pay <invoice>                 # → {"paid":true,"amount":21,"fee":2,"balance":9821}
node scripts/cashu.mjs invoice <amount>              # → {"invoice":"lnbc...","quoteId":"..."}
node scripts/cashu.mjs claim <quoteId> <amount>      # → {"claimed":1000,"balance":10844}
node scripts/cashu.mjs send <amount>                 # → {"token":"cashuA...","balance":9721}
node scripts/cashu.mjs receive <token>               # → {"received":100,"balance":9821}
```

**Note:** Cashu mints typically have a ~1000 character invoice limit. For longer invoices (e.g., NIP-57 zap requests ~1400 chars), use LNbits as a relay.

### LNbits (`scripts/lnbits.mjs`)

LNbits wallet operations via API.

```bash
node scripts/lnbits.mjs balance                      # → 10
node scripts/lnbits.mjs pay <invoice>                # → {"paid":true,"hash":"..."}
node scripts/lnbits.mjs invoice <amount> [memo]      # → {"invoice":"lnbc...","hash":"..."}
```

## Zap Payment Flow (Long Invoices)

To pay NIP-57 zap invoices that exceed Cashu mint limits:

1. `node scripts/lnbits.mjs invoice <amount+buffer>` → generate short invoice
2. `node scripts/cashu.mjs pay <short-invoice>` → fund LNbits wallet
3. `node scripts/lnbits.mjs pay <long-zap-invoice>` → pay the zap

This relay approach works around invoice length restrictions.

## References

- [Cashu Protocol](https://cashu.space/)
- [LNbits Documentation](https://docs.lnbits.org/)
- [NIP-57 Lightning Zaps](https://github.com/nostr-protocol/nips/blob/master/57.md)
