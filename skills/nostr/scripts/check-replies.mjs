#!/usr/bin/env node
import { nostr_read, getPriv, privToPub } from './lib.mjs';
import fs from 'fs';

const RELAYS = process.env.NOSTR_RELAYS?.split(',') || [];
const privHex = getPriv();
const myPubkey = privToPub(privHex);

// Parse command line arguments
let checkHistFile = null;
let sinceTimestamp = null;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check-hist' && i + 1 < args.length) {
    checkHistFile = args[i + 1];
    i++;
  } else if (args[i] === '--since' && i + 1 < args.length) {
    sinceTimestamp = parseInt(args[i + 1]);
    i++;
  }
}

// Read hist-file if provided
let repliedIds = new Set();
if (checkHistFile) {
  if (fs.existsSync(checkHistFile)) {
    const lines = fs.readFileSync(checkHistFile, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.startsWith('# Last check:')) {
        const timestamp = parseInt(line.split(':')[1].trim());
        if (!isNaN(timestamp) && !sinceTimestamp) {
          sinceTimestamp = timestamp;
        }
      } else if (line && !line.startsWith('#')) {
        repliedIds.add(line.trim());
      }
    }
  }
}

// Build filter
const filter = { kinds: [1], '#p': [myPubkey], limit: 50 };
if (sinceTimestamp) {
  filter.since = sinceTimestamp;
}

const events = await nostr_read(RELAYS, [filter]);

// Filter out replied events
const filteredEvents = events.filter(e => !repliedIds.has(e.id));

for (const event of filteredEvents.slice(0, 10)) {
  const date = new Date(event.created_at * 1000).toISOString();
  const shortId = event.id.slice(0, 12);
  const content = event.content.replace(/\n/g, ' ').slice(0, 1000);
  console.log(`[${date}] ${shortId}… ${content}`);
}

// Update hist-file with current timestamp
if (checkHistFile) {
  const now = Math.floor(Date.now() / 1000);
  let lines;
  
  if (fs.existsSync(checkHistFile)) {
    // Existing hist-file
    lines = fs.readFileSync(checkHistFile, 'utf-8').split('\n');
  } else {
    // First-time creation: fetch past replies to populate replied IDs
    console.error('🔍 First run: fetching past replies to initialize hist-file...');
    const myPosts = await nostr_read(RELAYS, [{
      kinds: [1],
      authors: [myPubkey],
      limit: 100
    }]);
    
    // Extract all e tags (replied-to event IDs)
    const pastRepliedIds = new Set();
    for (const post of myPosts) {
      for (const tag of post.tags) {
        if (tag[0] === 'e' && tag[1]) {
          pastRepliedIds.add(tag[1]);
        }
      }
    }
    
    console.error(`📝 Found ${pastRepliedIds.size} past replied event IDs`);
    
    // Initialize lines with header and past replied IDs
    lines = ['# replied IDs:', ''];
    for (const id of pastRepliedIds) {
      lines.push(id);
    }
  }
  
  // Update or add "Last check" line
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# Last check:')) {
      lines[i] = `# Last check: ${now}`;
      updated = true;
      break;
    }
  }
  
  if (!updated) {
    lines.unshift(`# Last check: ${now}`);
  }
  
  fs.writeFileSync(checkHistFile, lines.join('\n'));
}
