#!/usr/bin/env node
// nostr-relay — kind:10002 (NIP-65) relay list manager
// Usage:
//   nostr-relay list
//   nostr-relay add <url> [--read|--write]
//   nostr-relay delete <url>

import { getRelays, getPriv, privToPub, signEvent, nostr_read, nostr_write } from './lib.mjs';
import { mkdirSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd || !['list', 'add', 'delete'].includes(cmd)) {
  console.error('Usage: nostr-relay <list|add|delete> [url] [--read|--write]');
  process.exit(1);
}

const priv = getPriv();
const pub = privToPub(priv);
const relays = getRelays();

// Fetch current kind:10002
async function fetchCurrent() {
  const events = await nostr_read(relays, [{ kinds: [10002], authors: [pub], limit: 1 }]);
  return events[0] || null;
}

function displayRelays(ev) {
  if (!ev) { console.log('No kind:10002 relay list found.'); return; }
  const rTags = ev.tags.filter(t => t[0] === 'r');
  if (!rTags.length) { console.log('Relay list is empty.'); return; }
  console.log(`Relay list (${rTags.length} relays):`);
  for (const t of rTags) {
    const marker = t[2] ? ` [${t[2]}]` : ' [read+write]';
    console.log(`  ${t[1]}${marker}`);
  }
}

async function writeLog(action, before, after, relayResults) {
  const dir = new URL('./logs/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  const filename = `10002-${ts}.json`;
  const path = dir + filename;
  const log = { action, timestamp: new Date().toISOString(), before, after, relayResults };
  writeFileSync(path, JSON.stringify(log, null, 2));
  console.log(`📋 Log: ${path}`);
}

if (cmd === 'list') {
  const ev = await fetchCurrent();
  displayRelays(ev);
} else if (cmd === 'add') {
  const url = args[1];
  if (!url) { console.error('Usage: nostr-relay add <url> [--read|--write]'); process.exit(1); }
  const marker = args.includes('--read') ? 'read' : args.includes('--write') ? 'write' : null;

  const current = await fetchCurrent();
  const tags = current ? current.tags.filter(t => t[0] === 'r') : [];

  // Remove existing entry for this URL
  const filtered = tags.filter(t => t[1] !== url);
  const newTag = marker ? ['r', url, marker] : ['r', url];
  filtered.push(newTag);

  const event = signEvent({
    pubkey: pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 10002,
    tags: filtered,
    content: '',
  }, priv);

  console.log(`📡 Adding ${url}${marker ? ` [${marker}]` : ''} to relay list...`);
  const result = await nostr_write(relays, event);
  await writeLog('add', current, event, result);
  if (result.ok.length) console.log(`✅ OK: ${result.ok.join(', ')}`);
  if (result.fail.length) console.log(`❌ Fail: ${result.fail.join(', ')}`);
} else if (cmd === 'delete') {
  const url = args[1];
  if (!url) { console.error('Usage: nostr-relay delete <url>'); process.exit(1); }

  const current = await fetchCurrent();
  if (!current) { console.error('No existing relay list found.'); process.exit(1); }

  const tags = current.tags.filter(t => t[0] === 'r');
  const filtered = tags.filter(t => t[1] !== url);
  if (filtered.length === tags.length) { console.error(`Relay ${url} not found in list.`); process.exit(1); }

  const event = signEvent({
    pubkey: pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 10002,
    tags: filtered,
    content: '',
  }, priv);

  console.log(`🗑️  Removing ${url} from relay list...`);
  const result = await nostr_write(relays, event);
  await writeLog('delete', current, event, result);
  if (result.ok.length) console.log(`✅ OK: ${result.ok.join(', ')}`);
  if (result.fail.length) console.log(`❌ Fail: ${result.fail.join(', ')}`);
}
