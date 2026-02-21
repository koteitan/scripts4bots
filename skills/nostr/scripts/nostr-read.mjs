#!/usr/bin/env node
// nostr-read — 汎用 REQ (CLIラッパー)
// Usage: nostr-read '<filter-json>' ['<filter-json>' ...]
// Example: nostr-read '{"kinds":[1],"limit":5}'
import { getRelays, nostr_read } from './lib.mjs';

const filters = process.argv.slice(2).map(arg => {
  try { return JSON.parse(arg); } catch {
    console.error(`Invalid JSON filter: ${arg}`);
    process.exit(1);
  }
});

if (!filters.length) {
  console.error('Usage: nostr-read \'<filter-json>\' [...]');
  console.error('Example: nostr-read \'{"kinds":[1],"limit":5}\'');
  process.exit(1);
}

const events = await nostr_read(getRelays(), filters);
console.log(JSON.stringify(events, null, 2));
