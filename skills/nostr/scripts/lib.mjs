// nostr/lib.mjs — shared Nostr primitives (no nostr-tools, raw WebSocket)
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import WebSocket from 'ws';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ── .env auto-loader ─────────────────────────────────────────
// Priority: --nsec/--relay args > .env file > env vars
{
  // 1. Check --nsec and --relay in command line args (highest priority)
  const _cliSet = new Set();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--nsec' && i + 1 < argv.length) {
      process.env.NOSTR_NSEC = argv[i + 1]; _cliSet.add('NOSTR_NSEC'); i++;
    } else if (argv[i] === '--relay' && i + 1 < argv.length) {
      process.env.NOSTR_RELAYS = argv[i + 1]; _cliSet.add('NOSTR_RELAYS'); i++;
    }
  }

  // 2. Load .env from workspace root (3 levels up: scripts/ → nostr/ → skills/ → workspace/)
  //    .env takes priority over shell env vars (but not CLI args)
  const _scriptsDir = dirname(fileURLToPath(import.meta.url));
  const _workspaceRoot = resolve(_scriptsDir, '../../..');
  const _envPath = resolve(_workspaceRoot, '.env');
  if (fs.existsSync(_envPath)) {
    for (const line of fs.readFileSync(_envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key && !_cliSet.has(key)) process.env[key] = value;
    }
  } else {
    console.warn(`[lib] Warning: .env not found at ${_envPath}`);
  }

  // 3. If NOSTR_NSEC_FILE is set, read NSEC from that file
  if (process.env.NOSTR_NSEC_FILE && !process.env.NOSTR_NSEC) {
    const nsecFile = process.env.NOSTR_NSEC_FILE.replace(/^~/, process.env.HOME || '');
    if (fs.existsSync(nsecFile)) {
      process.env.NOSTR_NSEC = fs.readFileSync(nsecFile, 'utf8').trim();
    }
  }
}

// ── key helpers ──────────────────────────────────────────────
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(str) {
  const pos = str.lastIndexOf('1');
  const data = [];
  for (let i = pos + 1; i < str.length; i++) {
    const v = BECH32_CHARSET.indexOf(str[i]);
    if (v === -1) throw new Error('invalid bech32 char');
    data.push(v);
  }
  const words = data.slice(0, -6); // drop 6-byte checksum
  let acc = 0, bits = 0;
  const out = [];
  for (const v of words) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}

// ── bech32 encode ────────────────────────────────────────────
function convert8to5(data) {
  let acc = 0, bits = 0;
  const out = [];
  for (const v of data) {
    acc = (acc << 8) | v;
    bits += 8;
    while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 0x1f); }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 0x1f);
  return out;
}

function bech32Checksum(hrp, data5) {
  const values = [...hrpExpand(hrp), ...data5];
  const poly = bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [];
  for (let i = 0; i < 6; i++) checksum.push((poly >> (5 * (5 - i))) & 31);
  return checksum;
}

function hrpExpand(hrp) {
  const ret = [];
  for (const c of hrp) ret.push(c.charCodeAt(0) >> 5);
  ret.push(0);
  for (const c of hrp) ret.push(c.charCodeAt(0) & 31);
  return ret;
}

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function bech32Encode(hrp, bytes) {
  const data5 = convert8to5(bytes);
  const checksum = bech32Checksum(hrp, data5);
  return hrp + '1' + [...data5, ...checksum].map(v => BECH32_CHARSET[v]).join('');
}

/** Encode event id hex → nevent1... (NIP-19 TLV) */
export function encodeNevent(eventIdHex, relayHints = [], authorHex = null) {
  const buf = [];
  // TLV type 0: event id (32 bytes)
  const idBytes = hexToBytes(eventIdHex);
  buf.push(0, 32, ...idBytes);
  // TLV type 1: relay hints
  for (const r of relayHints) {
    const rb = new TextEncoder().encode(r);
    buf.push(1, rb.length, ...rb);
  }
  // TLV type 2: author pubkey
  if (authorHex) {
    const ab = hexToBytes(authorHex);
    buf.push(2, 32, ...ab);
  }
  return bech32Encode('nevent', new Uint8Array(buf));
}

/** Encode pubkey hex → npub1... */
export function encodeNpub(pubkeyHex) {
  return bech32Encode('npub', hexToBytes(pubkeyHex));
}

/** Any bech32 nostr id (nsec/npub/note/nevent) or hex → hex */
export function toHex(input) {
  if (/^[0-9a-f]{64}$/i.test(input)) return input.toLowerCase();
  if (input.startsWith('nsec1') || input.startsWith('npub1') || input.startsWith('note1')) {
    return bytesToHex(bech32Decode(input));
  }
  if (input.startsWith('nevent1')) {
    // TLV: parse all entries and find type 0 (event id)
    const bytes = bech32Decode(input);
    let i = 0;
    while (i < bytes.length) {
      if (i + 2 > bytes.length) break; // need at least type + length
      const type = bytes[i];
      const length = bytes[i + 1];
      if (i + 2 + length > bytes.length) break; // incomplete entry
      if (type === 0 && length === 32) {
        // found event id
        return bytesToHex(bytes.slice(i + 2, i + 2 + length));
      }
      i += 2 + length; // skip to next entry
    }
  }
  return input; // fallback
}

/** nsec (bech32) or hex → hex private key */
export function nsecToHex(nsec) {
  return toHex(nsec);
}

/** hex private key → hex public key (x-only schnorr) */
export function privToPub(privHex) {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(privHex)));
}

// ── event helpers ────────────────────────────────────────────
export function eventId(evt) {
  const serialized = JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}

export function signEvent(evt, privHex) {
  evt.id = eventId(evt);
  evt.sig = bytesToHex(schnorr.sign(hexToBytes(evt.id), hexToBytes(privHex)));
  return evt;
}

// ── env helpers ──────────────────────────────────────────────
export function getRelays() {
  const raw = process.env.NOSTR_RELAYS || '';
  const list = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  if (!list.length) {
    console.error('Error: NOSTR_RELAYS not set. Export e.g. NOSTR_RELAYS="wss://relay.damus.io,wss://nos.lol"');
    process.exit(1);
  }
  return list;
}

export function getPriv() {
  const nsec = process.env.NOSTR_NSEC || '';
  if (!nsec) { console.error('Error: NOSTR_NSEC not set.'); process.exit(1); }
  return nsecToHex(nsec);
}

// ── nostr_read ───────────────────────────────────────────────
/**
 * nostr_read(relays, filters, opts) → Promise<Event[]>
 *   汎用 REQ: 全リレーに REQ を送り、全リレーから EOSE を受信するか
 *   タイムアウトするまでイベントを収集。重複排除済み、created_at desc。
 *   opts.timeoutMs — 最大待ち時間 (default 10000)
 */
export function nostr_read(relays, filters, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const subId = 'r' + Math.random().toString(36).slice(2, 10);
  const seen = new Map();
  let eoseCount = 0;
  const total = relays.length;
  const sockets = [];

  return new Promise((resolve) => {
    const finish = () => {
      for (const ws of sockets) { try { ws.close(); } catch {} }
      clearTimeout(timer);
      resolve([...seen.values()].sort((a, b) => b.created_at - a.created_at));
    };
    const timer = setTimeout(finish, timeoutMs);

    for (const url of relays) {
      let ws;
      try { ws = new WebSocket(url); } catch { eoseCount++; if (eoseCount >= total) finish(); continue; }
      sockets.push(ws);

      ws.on('open', () => ws.send(JSON.stringify(['REQ', subId, ...filters])));
      ws.on('message', (raw) => {
        let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg[0] === 'EVENT' && msg[1] === subId) {
          const ev = msg[2];
          if (!seen.has(ev.id)) seen.set(ev.id, ev);
        } else if (msg[0] === 'EOSE' && msg[1] === subId) {
          eoseCount++;
          if (eoseCount >= total) finish();
        }
      });
      ws.on('error', () => { eoseCount++; if (eoseCount >= total) finish(); });
    }
  });
}

// ── nostr_write ──────────────────────────────────────────────
/**
 * nostr_write(relays, event, opts) → Promise<{ ok: string[], fail: string[] }>
 *   汎用 EVENT 発行: 全リレーに EVENT を送り OK レスポンスを待つ。
 *   opts.timeoutMs — 最大待ち時間 (default 10000)
 */
export function nostr_write(relays, event, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const ok = [], fail = [];
  let doneCount = 0;
  const total = relays.length;
  const sockets = [];

  return new Promise((resolve) => {
    const finish = () => {
      for (const ws of sockets) { try { ws.close(); } catch {} }
      clearTimeout(timer);
      resolve({ ok, fail });
    };
    const timer = setTimeout(finish, timeoutMs);

    for (const url of relays) {
      let ws;
      try { ws = new WebSocket(url); } catch { fail.push(url); doneCount++; if (doneCount >= total) finish(); continue; }
      sockets.push(ws);

      ws.on('open', () => ws.send(JSON.stringify(['EVENT', event])));
      ws.on('message', (raw) => {
        let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg[0] === 'OK' && msg[1] === event.id) {
          if (msg[2]) ok.push(url); else fail.push(url + ': ' + (msg[3] || 'rejected'));
          doneCount++;
          if (doneCount >= total) finish();
        }
      });
      ws.on('error', () => { fail.push(url); doneCount++; if (doneCount >= total) finish(); });
    }
  });
}
