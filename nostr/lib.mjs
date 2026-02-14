// nostr/lib.mjs — shared Nostr primitives (no nostr-tools, raw WebSocket)
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import WebSocket from 'ws';

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

/** nsec (bech32) or hex → hex private key */
export function nsecToHex(nsec) {
  if (nsec.startsWith('nsec1')) return bytesToHex(bech32Decode(nsec));
  return nsec;
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
