#!/usr/bin/env node
// wallets/cashu.mjs — Cashu wallet CLI
// Usage: cashu <command> [args]
//   balance                    残高
//   pay <invoice>              LN invoice支払い
//   invoice <amount>           入金用invoice作成
//   claim <quoteId> <amount>   ミント
//   send <amount>              Cashuトークン発行
//   receive <token>            トークン受取
//
// Env: CASHU_MINT (default: https://mint.coinos.io)

import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const MINT = process.env.CASHU_MINT || 'https://mint.coinos.io';
const FILE = join(DIR, 'cashu-data.json');

const load = () => fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { mint: MINT, proofs: [] };
const save = (d) => fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
const bal = (proofs) => proofs.reduce((s, p) => s + p.amount, 0);

async function init() {
  const mint = new CashuMint(MINT);
  const w = new CashuWallet(mint, { unit: 'sat' });
  await w.loadMint();
  return w;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'balance') {
  console.log(bal(load().proofs));

} else if (cmd === 'pay') {
  const invoice = args[0];
  if (!invoice) { console.error('Usage: cashu pay <invoice>'); process.exit(1); }
  const w = await init();
  const d = load();
  const q = await w.createMeltQuote(invoice);
  const cost = q.amount + q.fee_reserve;
  const { keep, send } = await w.send(cost + 1, d.proofs);
  const r = await w.meltProofs(q, send);
  d.proofs = [...keep, ...(r.change || [])];
  save(d);
  console.log(JSON.stringify({ paid: true, amount: q.amount, fee: q.fee_reserve, balance: bal(d.proofs) }));

} else if (cmd === 'invoice') {
  const amount = parseInt(args[0]);
  if (!amount) { console.error('Usage: cashu invoice <amount>'); process.exit(1); }
  const w = await init();
  const q = await w.createMintQuote(amount);
  console.log(JSON.stringify({ invoice: q.request, quoteId: q.quote, amount }));

} else if (cmd === 'claim') {
  const [quoteId, amt] = args;
  if (!quoteId || !amt) { console.error('Usage: cashu claim <quoteId> <amount>'); process.exit(1); }
  const w = await init();
  const d = load();
  const proofs = await w.mintProofs(parseInt(amt), quoteId);
  d.proofs.push(...proofs);
  save(d);
  console.log(JSON.stringify({ claimed: parseInt(amt), balance: bal(d.proofs) }));

} else if (cmd === 'send') {
  const amount = parseInt(args[0]);
  if (!amount) { console.error('Usage: cashu send <amount>'); process.exit(1); }
  const w = await init();
  const d = load();
  const { keep, send } = await w.send(amount, d.proofs);
  d.proofs = keep;
  save(d);
  const token = getEncodedToken({ mint: MINT, proofs: send, unit: 'sat' });
  console.log(JSON.stringify({ token, amount, balance: bal(d.proofs) }));

} else if (cmd === 'receive') {
  const token = args[0];
  if (!token) { console.error('Usage: cashu receive <token>'); process.exit(1); }
  const w = await init();
  const d = load();
  const proofs = await w.receive(token);
  d.proofs.push(...proofs);
  save(d);
  console.log(JSON.stringify({ received: proofs.reduce((s, p) => s + p.amount, 0), balance: bal(d.proofs) }));

} else {
  console.error('Commands: balance, pay, invoice, claim, send, receive');
  process.exit(1);
}
