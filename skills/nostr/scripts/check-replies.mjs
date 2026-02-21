import { nostr_read, getPriv, privToPub } from './lib.mjs';

const RELAYS = process.env.NOSTR_RELAYS?.split(',') || [];
const privHex = getPriv();
const myPubkey = privToPub(privHex);

const events = await nostr_read(RELAYS, [{ kinds: [1], '#p': [myPubkey], limit: 10 }]);

for (const event of events.slice(0, 10)) {
  const date = new Date(event.created_at * 1000).toISOString();
  const shortId = event.id.slice(0, 12);
  const content = event.content.replace(/\n/g, ' ').slice(0, 100);
  console.log(`[${date}] ${shortId}… ${content}`);
}
