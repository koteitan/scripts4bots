import { nostr_read, getPriv, privToPub } from './lib.mjs';

const RELAYS = process.env.NOSTR_RELAYS?.split(',') || [];
const id = process.argv[2];
if (!id) { console.error('Usage: node show-reply.mjs <event-id>'); process.exit(1); }

const events = await nostr_read(RELAYS, [{ ids: [id] }]);
if (events.length === 0) { console.error('Event not found'); process.exit(1); }

const evt = events[0];
console.log('ID:', evt.id);
console.log('Author:', evt.pubkey);
console.log('Created:', new Date(evt.created_at * 1000).toISOString());
console.log('Content:', evt.content);
console.log('Tags:', JSON.stringify(evt.tags, null, 2));
