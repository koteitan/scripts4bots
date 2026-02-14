#!/usr/bin/env node
// wallets/lnbits.mjs — LNbits wallet CLI
// Usage: lnbits <command> [args]
//   balance                    残高 (sats)
//   pay <invoice>              LN invoice支払い
//   invoice <amount> [memo]    入金用invoice作成
//
// Env: LNBITS_URL, LNBITS_ADMIN_KEY, LNBITS_INVOICE_KEY

const URL = process.env.LNBITS_URL || 'https://demo.lnbits.com';
const ADMIN = process.env.LNBITS_ADMIN_KEY;
const INV = process.env.LNBITS_INVOICE_KEY;

if (!ADMIN || !INV) {
  console.error('Set LNBITS_ADMIN_KEY and LNBITS_INVOICE_KEY');
  process.exit(1);
}

async function api(path, key, body) {
  const opts = { headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' } };
  if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  const r = await fetch(`${URL}${path}`, opts);
  return r.json();
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'balance') {
  const d = await api('/api/v1/wallet', INV);
  console.log(Math.floor((d.balance || 0) / 1000));

} else if (cmd === 'pay') {
  const invoice = args[0];
  if (!invoice) { console.error('Usage: lnbits pay <invoice>'); process.exit(1); }
  const d = await api('/api/v1/payments', ADMIN, { out: true, bolt11: invoice });
  if (d.payment_hash) {
    console.log(JSON.stringify({ paid: true, hash: d.payment_hash }));
  } else {
    console.error(JSON.stringify({ paid: false, error: d }));
    process.exit(1);
  }

} else if (cmd === 'invoice') {
  const amount = parseInt(args[0]);
  const memo = args.slice(1).join(' ') || 'funding';
  if (!amount) { console.error('Usage: lnbits invoice <amount>'); process.exit(1); }
  const d = await api('/api/v1/payments', INV, { out: false, amount, memo });
  console.log(JSON.stringify({ invoice: d.payment_request, hash: d.payment_hash, amount }));

} else {
  console.error('Commands: balance, pay, invoice');
  process.exit(1);
}
