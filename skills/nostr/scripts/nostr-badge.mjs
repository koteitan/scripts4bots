#!/usr/bin/env node
// nostr-badge — NIP-58 Badge operations
// Usage:
//   nostr-badge define --name "Badge Name" --desc "Description" --image <url> [--thumb <url>] --d <unique-id>
//   nostr-badge award --d <badge-d-tag> --p <pubkey-hex> [--p <pubkey-hex> ...]
//   nostr-badge accept --a <kind:pubkey:d> --e <award-event-id> [--a ... --e ...]

import { getRelays, getPriv, privToPub, signEvent, nostr_write } from './lib.mjs';

const args = process.argv.slice(2);
const command = args[0];

if (!command || !['define', 'award', 'accept'].includes(command)) {
  console.error('Usage: nostr-badge <define|award|accept> [options]');
  process.exit(1);
}

const priv = getPriv();
const pub = privToPub(priv);
const relays = getRelays();

function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

function getAllArgs(name) {
  const results = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) results.push(args[++i]);
  }
  return results;
}

if (command === 'define') {
  const name = getArg('--name');
  const desc = getArg('--desc');
  const image = getArg('--image');
  const thumb = getArg('--thumb');
  const d = getArg('--d');

  if (!name || !d) { console.error('--name and --d required'); process.exit(1); }

  const tags = [
    ['d', d],
    ['name', name],
  ];
  if (desc) tags.push(['description', desc]);
  if (image) tags.push(['image', image, '1024x1024']);
  if (thumb) tags.push(['thumb', thumb, '256x256']);

  const event = signEvent({
    pubkey: pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 30009,
    tags,
    content: '',
  }, priv);

  console.log(`🏅 Creating badge definition "${name}"...`);
  console.log(`   id: ${event.id}`);
  console.log(`   d-tag: ${d}`);

  const { ok, fail } = await nostr_write(relays, event);
  if (ok.length) console.log(`✅ OK: ${ok.join(', ')}`);
  if (fail.length) console.log(`❌ Fail: ${fail.join(', ')}`);

} else if (command === 'award') {
  const d = getArg('--d');
  const pubkeys = getAllArgs('--p');

  if (!d || !pubkeys.length) { console.error('--d and at least one --p required'); process.exit(1); }

  const aTag = `30009:${pub}:${d}`;
  const tags = [
    ['a', aTag],
    ...pubkeys.map(p => ['p', p]),
  ];

  const event = signEvent({
    pubkey: pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 8,
    tags,
    content: '',
  }, priv);

  console.log(`🎖️ Awarding badge "${d}" to ${pubkeys.length} recipient(s)...`);
  console.log(`   id: ${event.id}`);

  const { ok, fail } = await nostr_write(relays, event);
  if (ok.length) console.log(`✅ OK: ${ok.join(', ')}`);
  if (fail.length) console.log(`❌ Fail: ${fail.join(', ')}`);

} else if (command === 'accept') {
  // Accept badges: kind 30008
  // --a <kind:pubkey:d> --e <award-event-id> pairs
  const aTags = getAllArgs('--a');
  const eTags = getAllArgs('--e');

  if (!aTags.length || aTags.length !== eTags.length) {
    console.error('Need matching --a and --e pairs'); process.exit(1);
  }

  const tags = [['d', 'profile_badges']];
  for (let i = 0; i < aTags.length; i++) {
    tags.push(['a', aTags[i]]);
    tags.push(['e', eTags[i]]);
  }

  const event = signEvent({
    pubkey: pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 30008,
    tags,
    content: '',
  }, priv);

  console.log(`📌 Accepting ${aTags.length} badge(s)...`);
  console.log(`   id: ${event.id}`);

  const { ok, fail } = await nostr_write(relays, event);
  if (ok.length) console.log(`✅ OK: ${ok.join(', ')}`);
  if (fail.length) console.log(`❌ Fail: ${fail.join(', ')}`);
}
