#!/usr/bin/env node
// Nostr Timeline Check
// Usage: nostr-tl.mjs -n <count> --since <unix-timestamp>
// Example: nostr-tl.mjs -n 10 --since 1773893440
import { getRelays, getPriv, privToPub, toHex, nostr_read, signEvent } from './lib.mjs';
import { encodeNevent } from './lib.mjs';

const args = process.argv.slice(2);
let count = 10;
let since = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-n' && i + 1 < args.length) {
    count = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--since' && i + 1 < args.length) {
    since = parseInt(args[i + 1], 10);
    i++;
  }
}

if (!since) {
  console.error('Usage: nostr-tl.mjs -n <count> --since <unix-timestamp>');
  process.exit(1);
}

const relays = getRelays();
const priv = getPriv();
const myPubkey = privToPub(priv);

console.log(`Fetching kind:1 events since ${since} (count: ${count})...\n`);

const events = await nostr_read(
  relays,
  [
    {
      kinds: [1],
      since: since,
      limit: count,
    }
  ],
  { timeoutMs: 15000 }
);

if (events.length === 0) {
  console.log('No new events found.');
  process.exit(0);
}

console.log(`Found ${events.length} new events:\n`);

for (const ev of events) {
  const info = await import('./lib.mjs').then(m => m.getProfileInfo(ev.pubkey, relays));
  const authorLabel = info ? (info.display_name || info.name || ev.pubkey.slice(0, 8)) : ev.pubkey.slice(0, 8);
  const time = new Date(ev.created_at * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const content = ev.content.slice(0, 100) + (ev.content.length > 100 ? '...' : '');
  console.log(`[${time}] ${authorLabel}: ${content}`);

  // React to interesting content
  const contentLower = content.toLowerCase();
  let emoji = null;

  // Check for keywords that trigger reactions
  if (contentLower.includes('hello') || contentLower.includes('hi')) {
    emoji = '👋';
  } else if (contentLower.includes('👍') || contentLower.includes('good') || contentLower.includes('great')) {
    emoji = '👍';
  } else if (contentLower.includes('thanks') || contentLower.includes('thank')) {
    emoji = '🙏';
  } else if (contentLower.includes('lol') || contentLower.includes('lmao')) {
    emoji = '😂';
  } else if (contentLower.includes('wow') || contentLower.includes('amazing')) {
    emoji = '😮';
  } else if (contentLower.includes('sad') || contentLower.includes('depressed')) {
    emoji = '😢';
  } else if (contentLower.includes('happy') || contentLower.includes('joy')) {
    emoji = '😊';
  } else if (contentLower.includes('cat') || contentLower.includes('kitty')) {
    emoji = '🐱';
  } else if (contentLower.includes('dog') || contentLower.includes('puppy')) {
    emoji = '🐶';
  } else if (contentLower.includes('food') || contentLower.includes('delicious')) {
    emoji = '🍣';
  } else if (contentLower.includes('nostr') || contentLower.includes('nostr')) {
    emoji = '⚡';
  }

  // Only react if it's not a bot
  if (emoji && info && !info.bot) {
    // Check if already reacted
    const existing = await import('./lib.mjs').then(m =>
      m.nostr_read(
        relays,
        [{ kinds: [7], authors: [myPubkey], '#e': [ev.id], limit: 10 }],
        { timeoutMs: 5000 }
      )
    );
    const duplicate = existing.find(e => e.content === emoji);

    if (!duplicate) {
      const reactEv = signEvent({
        pubkey: myPubkey,
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', ev.id], ['p', ev.pubkey]],
        content: emoji,
      }, priv);

      await import('./lib.mjs').then(m => m.nostr_write(relays, reactEv, { timeoutMs: 5000 }));

      console.log(`  → Reacted ${emoji}`);
    }
  }

  console.log('');
}

// Update lastTlAt
const fs = await import('fs');
const heartbeatStatePath = process.env.HOME + '/.openclaw/workspace/memory/heartbeat-state.json';
const state = JSON.parse(fs.readFileSync(heartbeatStatePath, 'utf8'));
state.lastTlAt = Math.floor(Date.now() / 1000);
fs.writeFileSync(heartbeatStatePath, JSON.stringify(state, null, 2));

console.log(`Updated lastTlAt to ${state.lastTlAt}`);
