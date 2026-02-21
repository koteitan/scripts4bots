#!/usr/bin/env node
// nostr-follow — kind:3 (NIP-02) follow/contact list manager
// Usage:
//   nostr-follow list
//   nostr-follow add <npub_or_hex> [--petname <name>]
//   nostr-follow delete <npub_or_hex>

import { getRelays, getPriv, privToPub, signEvent, nostr_read, nostr_write, toHex, encodeNpub } from './lib.mjs';
import { mkdirSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd || !['list', 'add', 'delete'].includes(cmd)) {
  console.error('Usage: nostr-follow <list|add|delete> [npub_or_hex] [--petname <name>]');
  process.exit(1);
}

const priv = getPriv();
const pub = privToPub(priv);
const relays = getRelays();

async function fetchCurrent() {
  const events = await nostr_read(relays, [{ kinds: [3], authors: [pub], limit: 1 }]);
  return events[0] || null;
}

async function writeLog(action, before, after, relayResults) {
  const dir = new URL('./logs/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  const filename = `3-${ts}.json`;
  const path = dir + filename;
  const log = { action, timestamp: new Date().toISOString(), before, after, relayResults };
  writeFileSync(path, JSON.stringify(log, null, 2));
  console.log(`📋 Log: ${path}`);
}

if (cmd === 'list') {
  const ev = await fetchCurrent();
  if (!ev) { console.log('No kind:3 follow list found.'); process.exit(0); }
  const pTags = ev.tags.filter(t => t[0] === 'p');
  if (!pTags.length) { console.log('Follow list is empty.'); process.exit(0); }
  console.log(`Following (${pTags.length}):`);
  for (const t of pTags) {
    const npub = encodeNpub(t[1]);
    const petname = t[3] || '';
    console.log(`  ${npub}${petname ? ` (${petname})` : ''}`);
  }
} else if (cmd === 'add') {
  const target = args[1];
  if (!target) { console.error('Usage: nostr-follow add <npub_or_hex> [--petname <name>]'); process.exit(1); }
  const hex = toHex(target);
  let petname = '';
  const pIdx = args.indexOf('--petname');
  if (pIdx !== -1 && args[pIdx + 1]) petname = args[pIdx + 1];

  const current = await fetchCurrent();
  const tags = current ? current.tags.filter(t => t[0] === 'p') : [];
  const otherTags = current ? current.tags.filter(t => t[0] !== 'p') : [];
  const content = current?.content || '';

  // Remove existing entry, then add
  const filtered = tags.filter(t => t[1] !== hex);
  filtered.push(['p', hex, '', petname]);

  const event = signEvent({
    pubkey: pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 3,
    tags: [...otherTags, ...filtered],
    content,
  }, priv);

  console.log(`👤 Adding ${encodeNpub(hex)}${petname ? ` (${petname})` : ''} to follow list...`);
  const result = await nostr_write(relays, event);
  await writeLog('add', current, event, result);
  if (result.ok.length) console.log(`✅ OK: ${result.ok.join(', ')}`);
  if (result.fail.length) console.log(`❌ Fail: ${result.fail.join(', ')}`);
} else if (cmd === 'delete') {
  const target = args[1];
  if (!target) { console.error('Usage: nostr-follow delete <npub_or_hex>'); process.exit(1); }
  const hex = toHex(target);

  const current = await fetchCurrent();
  if (!current) { console.error('No existing follow list found.'); process.exit(1); }

  const pTags = current.tags.filter(t => t[0] === 'p');
  const otherTags = current.tags.filter(t => t[0] !== 'p');
  const filtered = pTags.filter(t => t[1] !== hex);
  if (filtered.length === pTags.length) { console.error(`Pubkey ${hex.slice(0, 16)}… not found in follow list.`); process.exit(1); }

  const event = signEvent({
    pubkey: pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 3,
    tags: [...otherTags, ...filtered],
    content: current.content || '',
  }, priv);

  console.log(`🗑️  Removing ${encodeNpub(hex)} from follow list...`);
  const result = await nostr_write(relays, event);
  await writeLog('delete', current, event, result);
  if (result.ok.length) console.log(`✅ OK: ${result.ok.join(', ')}`);
  if (result.fail.length) console.log(`❌ Fail: ${result.fail.join(', ')}`);
}
