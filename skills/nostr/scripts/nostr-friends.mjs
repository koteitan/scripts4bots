// nostr-friends.mjs — persistent friend storage helpers (import-only module)
// Stores per-author kind:0 profile and kind:1 thread chains under
//   nostr-friends/<author_npub>/kind0.txt
//   nostr-friends/<author_npub>/thread-<rootEventId>.txt
import fs from 'fs';
import { createHash } from 'crypto';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { nostr_read, encodeNpub } from './lib.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const FRIENDS_DIR = resolve(SCRIPTS_DIR, 'nostr-friends');

function computeModuleRevision() {
  try {
    const selfPath = fileURLToPath(import.meta.url);
    const raw = fs.readFileSync(selfPath, 'utf8');
    return createHash('sha1').update(raw).digest('hex').slice(0, 6);
  } catch {
    return 'unknown';
  }
}

export const NOSTR_FRIENDS_REV = computeModuleRevision();


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
export function appendThreadToKind1(authorNpub, rootEventId, threadEvents) {
  try {
    const dir = resolve(FRIENDS_DIR, authorNpub);
    if (!fs.existsSync(dir)) return;
    const safeRoot = /^[0-9a-f]{64}$/i.test(rootEventId || '') ? rootEventId.toLowerCase() : 'unknown';
    const filePath = resolve(dir, `thread-${safeRoot}.txt`);

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
function shortNpub(npub) {
  return npub ? `${npub.slice(0, 10)}…${npub.slice(-4)}` : 'unknown';
}

function resolveDisplayNameFromKind0(rawKind0, authorNpub) {
  let displayName = '';
  let name = '';
  try {
    const p = JSON.parse(rawKind0 || '{}');
    displayName = String(p.display_name || p.displayName || '').trim().slice(0, 64);
    name = String(p.name || '').trim().slice(0, 64);
  } catch {
    displayName = '';
    name = '';
  }

  // 仕様: 👤 friend: <display_name> @<name>（欠損時フォールバック）
  if (displayName && name) {
    return displayName === name ? displayName : `${displayName} @${name}`;
  }
  if (displayName) return displayName;
  if (name) return `@${name}`;
  return shortNpub(authorNpub);
}

function threadFileToDiscordSnippet(raw, maxLen = 1000) {
  // Remove metadata lines and keep only content body lines
  const lines = String(raw || '').split('\n');
  const out = [];
  let inContent = false;
  for (const line of lines) {
    if (line === '---') { inContent = false; continue; }
    if (line.startsWith('event_id:') || line.startsWith('created_at:') || line.startsWith('pubkey:') || line.startsWith('npub:') || line.startsWith('tags:')) {
      continue;
    }
    if (line === 'content:') { inContent = true; continue; }
    if (inContent) out.push(line);
  }
  return out.join('\n').trim().slice(0, maxLen);
}

export function buildFriendContext(authorNpub, opts = {}) {
  const dir = resolve(FRIENDS_DIR, authorNpub);
  if (!fs.existsSync(dir)) return '';

  const parts = [];

  // display name only (kind0 raw is stored but not shown on Discord)
  const k0path = resolve(dir, 'kind0.txt');
  if (fs.existsSync(k0path)) {
    const raw = fs.readFileSync(k0path, 'utf8').trim();
    const shown = resolveDisplayNameFromKind0(raw, authorNpub);
    parts.push(`👤 friend: ${shown}`);
  }

  // thread root files — up to 10 newest by mtime
  const excludeRootId = /^[0-9a-f]{64}$/i.test(opts.excludeRootId || '')
    ? String(opts.excludeRootId).toLowerCase()
    : '';

  let threadFiles;
  try {
    threadFiles = fs.readdirSync(dir)
      .filter(f => /^thread-[0-9a-f]{64}\.txt$/i.test(f))
      .filter(f => !excludeRootId || !f.toLowerCase().startsWith(`thread-${excludeRootId}`))
      .map(f => ({ f, m: fs.statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
      .slice(0, 10)
      .map(x => x.f);
  } catch {
    threadFiles = [];
  }

  if (threadFiles.length > 0) {
    const chunks = [];
    let idx = 1;
    for (const f of threadFiles) {
      let fileContent = '';
      try { fileContent = fs.readFileSync(resolve(dir, f), 'utf8').trim(); } catch { fileContent = ''; }
      if (!fileContent) continue;
      const snippet = threadFileToDiscordSnippet(fileContent, 1000);
      if (!snippet) continue;
      chunks.push(`--- thread ${idx} ---\n${snippet}`);
      idx++;
    }
    if (chunks.length > 0) {
      parts.push(`📚 recent threads (excluding current)\n${chunks.join('\n\n')}`);
    }
  }

  return parts.join('\n\n');
}
