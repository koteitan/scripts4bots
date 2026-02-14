#!/usr/bin/env node
// nostr-read — generic REQ (collects until EOSE from all relays)
// Usage: nostr-read '<filter-json>' ['<filter-json>' ...]
// Example: nostr-read '{"kinds":[1],"limit":5}'

import { getRelays, nostrReq } from './lib.mjs';

const filters = process.argv.slice(2).map(arg => {
  try { return JSON.parse(arg); } catch (e) {
    console.error(`Invalid JSON filter: ${arg}`);
    process.exit(1);
  }
});

if (!filters.length) {
  console.error('Usage: nostr-read \'<filter-json>\' [\'<filter-json>\' ...]');
  console.error('Example: nostr-read \'{"kinds":[1],"limit":5}\'');
  process.exit(1);
}

const relays = getRelays();
const events = await nostrReq(relays, filters);
console.log(JSON.stringify(events, null, 2));
