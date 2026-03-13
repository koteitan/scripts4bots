// nostr-friends.mjs — persistent friend storage helpers (import-only module)
// Stores per-author kind:0 profile and kind:1 thread chains under
//   nostr-friends/<author_npub>/kind0.txt
//   nostr-friends/<author_npub>/kind1-YYYYMMDD.txt
import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { nostr_read, encodeNpub } from './lib.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const FRIENDS_DIR = resolve(SCRIPTS_DIR, 'nostr-friends');

/** YYYYMMDD string in UTC */
function todayStr() {
  const d = new Date();
  return d.getUTCFullYear().toString()
    + String(d.getUTCMonth() + 1).padStart(2, '0')
    + String(d.getUTCDate()).padStart(2, '0');
}

/** Extract root event ID from NIP-10 e tags */
export function getRootId(event) {
  const eTags = event.tags.filter(t => t[0] === 'e');
  const rootTag = eTags.find(t => t[3] === 'root');
  if (rootTag) return rootTag[1];
  if (eTags.length > 0) return eTags[0][1];
  return null;
}

/** Fetch thread events for a root ID (oldest-first). */
export async function fetchFriendThread(rootId, relays) {
  try {
    const [threadEvents, rootEvents] = await Promise.all([
      nostr_read(relays, [{ '#e': [rootId], kinds: [1] }]),
      nostr_read(relays, [{ ids: [rootId], kinds: [1] }])
    ]);
    const seen = new Set();
    const unique = [...rootEvents, ...threadEvents].filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    unique.sort((a, b) => a.created_at - b.created_at);
    return unique;
  } catch {
    return null;
  }
}

function getReplyId(event) {
  const eTags = event.tags.filter(t => t[0] === 'e');
  const replyTag = eTags.find(t => t[3] === 'reply');
  if (replyTag) return replyTag[1];
  if (eTags.length > 0) return eTags[eTags.length - 1][1];
  return null;
}

/**
 * Current post -> parent -> ... -> root の直系チェーンを取得（oldest-first）
 */
export async function fetchAncestorChainFromEvent(event, relays, maxDepth = 30) {
  const chain = [event];
  const seen = new Set([event.id]);
  let current = event;

  for (let i = 0; i < maxDepth; i++) {
    const parentId = getReplyId(current);
    if (!parentId || seen.has(parentId)) break;

    let parent = null;
    try {
      const events = await nostr_read(relays, [{ ids: [parentId], kinds: [1], limit: 1 }], { timeoutMs: 5000 });
      parent = events[0] || null;
    } catch {
      parent = null;
    }

    if (!parent) break;
    chain.push(parent);
    seen.add(parent.id);
    current = parent;
  }

  chain.sort((a, b) => a.created_at - b.created_at);
  return chain;
}

/**
 * Ensure friend dir exists; fetch & save kind:0 if newly created.
 * Returns the author's npub string.
 */
export async function ensureFriend(authorPubkeyHex, relays) {
  const authorNpub = encodeNpub(authorPubkeyHex);
  const dir = resolve(FRIENDS_DIR, authorNpub);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      try {
        const events = await nostr_read(
          relays,
          [{ kinds: [0], authors: [authorPubkeyHex], limit: 1 }],
          { timeoutMs: 5000 }
        );
        fs.writeFileSync(resolve(dir, 'kind0.txt'), events.length > 0 ? events[0].content : 'not found', 'utf8');
      } catch {
        fs.writeFileSync(resolve(dir, 'kind0.txt'), 'not found', 'utf8');
      }
    }

    const todayPath = resolve(dir, `kind1-${todayStr()}.txt`);
    if (!fs.existsSync(todayPath)) fs.writeFileSync(todayPath, '', 'utf8');
  } catch {
    // 失敗しても処理継続
  }

  return authorNpub;
}

/**
 * Append thread events to today's kind1 file (dedup by event ID).
 * Block format per event:
 * ---
 * event_id: <id>
 * created_at: <ISO>
 * pubkey: <hex>
 * npub: <npub>
 * content:
 * <content>
 * tags: <raw json>
 */
export function appendThreadToKind1(authorNpub, threadEvents) {
  try {
    const dir = resolve(FRIENDS_DIR, authorNpub);
    if (!fs.existsSync(dir)) return;
    const filePath = resolve(dir, `kind1-${todayStr()}.txt`);

    // Collect already-stored event IDs from block format
    const existingIds = new Set();
    if (fs.existsSync(filePath)) {
      for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
        const m = line.match(/^event_id:\s*([0-9a-f]{64})$/i);
        if (m) existingIds.add(m[1].toLowerCase());
      }
    }

    const blocks = [];
    for (const ev of threadEvents || []) {
      if (!ev?.id) continue;
      const id = ev.id.toLowerCase();
      if (existingIds.has(id)) continue;
      existingIds.add(id);

      const iso = new Date((ev.created_at || 0) * 1000).toISOString();
      const npub = (() => { try { return encodeNpub(ev.pubkey || ''); } catch { return ''; } })();
      const tagsRaw = (() => { try { return JSON.stringify(ev.tags || []); } catch { return '[]'; } })();
      const content = (ev.content || '').replace(/\r/g, '');

      blocks.push([
        '---',
        `event_id: ${id}`,
        `created_at: ${iso}`,
        `pubkey: ${ev.pubkey || ''}`,
        `npub: ${npub}`,
        'content:',
        content,
        `tags: ${tagsRaw}`,
        ''
      ].join('\n'));
    }

    if (blocks.length > 0) fs.appendFileSync(filePath, blocks.join(''), 'utf8');
  } catch {
    // ファイル書き込み失敗でも hook 全体は止めない
  }
}

/**
 * Build a friend context string for inclusion in Discord messages.
 * kind0 は raw を提示、kind1 は新しい順で最大10ファイル分を提示。
 * 全体は maxChars に収める。
 */
export function buildFriendContext(authorNpub, maxChars = 1100) {
  const dir = resolve(FRIENDS_DIR, authorNpub);
  if (!fs.existsSync(dir)) return '';

  const parts = [];

  // display name (human-readable) + kind0 raw
  const k0path = resolve(dir, 'kind0.txt');
  if (fs.existsSync(k0path)) {
    const raw = fs.readFileSync(k0path, 'utf8').trim();
    let preferred = '';
    try {
      const p = JSON.parse(raw || '{}');
      preferred = (p.display_name || p.displayName || p.name || '').trim();
    } catch {
      preferred = '';
    }
    const fallback = `${authorNpub.slice(0, 10)}…${authorNpub.slice(-4)}`;
    const shown = preferred || fallback;
    parts.push(`👤 friend: ${shown} (${fallback})`);
    parts.push(`📄 kind0.txt\n${(raw || 'not found').slice(0, 400)}`);
  }

  // kind1 files — up to 10 newest (raw excerpt)
  let k1files;
  try {
    k1files = fs.readdirSync(dir)
      .filter(f => /^kind1-\d{8}\.txt$/.test(f))
      .sort().reverse().slice(0, 10);
  } catch {
    k1files = [];
  }

  if (k1files.length > 0) {
    const chunks = [];
    for (const f of k1files) {
      let fileContent = '';
      try { fileContent = fs.readFileSync(resolve(dir, f), 'utf8').trim(); } catch { fileContent = ''; }
      if (!fileContent) continue;
      chunks.push(`📄 ${f}\n${fileContent.slice(0, 220)}`);
    }
    if (chunks.length > 0) {
      parts.push(`📝 kind1 files (newest 10)\n${chunks.join('\n')}`);
    }
  }

  if (parts.length === 0) return '';
  const combined = parts.join('\n\n');
  return combined.length <= maxChars ? combined : combined.slice(0, maxChars - 1) + '…';
}
