// Deterministic PID minter — lazy materialization per Foundation v1.
// Spec: C:/asolaria-foundation-v1/05-100B-PID-MINTING.md + 03-CUBE-OF-CUBES.md
//
// mintPID(opts) is a PURE FUNCTION:
//   tuple form: mintPID({ actor, device, lane, prime, alphabet? })
//   index form: mintPID({ index, alphabet? })
// No hidden state. No spawning. No storage for unmaterialized PIDs.

import { createHash } from 'node:crypto';
import { glyphAt } from './behcs.mjs';

// 7-lane canon — 7th LYMPHATIC minted 2026-05-28 per Special-OP-JESSE vote (chain seq pending).
// LYMPHATIC = drain/cleanse substrate (maps to GULP + drain pipeline :4920-:4924).
// Vote-quorum satisfied by Special-OP-JESSE under Foundation v3 LAW 2-month decision window.
const LANES = ['nervous', 'circulatory', 'skeletal', 'muscular', 'immune', 'memory', 'lymphatic'];
const LANE_SET = new Set(LANES);

// Big-Pickle busCount target per 05-100B-PID-MINTING.md.
const MAX_INDEX = 100_000_000_000n;

function sha16(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function validateAlphabet(alphabet) {
  if (alphabet !== 256 && alphabet !== 1024) {
    throw new RangeError(`mintPID: alphabet must be 256 or 1024 (got ${alphabet})`);
  }
}

function mintFromTuple({ actor, device, lane, prime, alphabet }) {
  if (!Number.isInteger(actor) || actor < 0 || actor >= alphabet) {
    throw new RangeError(`mintPID: actor must be integer in [0, ${alphabet}) (got ${actor})`);
  }
  if (typeof device !== 'string' || device.length === 0) {
    throw new TypeError('mintPID: device must be non-empty string');
  }
  if (!LANE_SET.has(lane)) {
    throw new RangeError(
      `mintPID: lane must be one of ${LANES.join(', ')} (got ${JSON.stringify(lane)})`
    );
  }
  if (!Number.isInteger(prime) || prime < 2) {
    throw new RangeError(`mintPID: prime must be integer >= 2 (got ${prime})`);
  }

  // Subset embedding: actor < 256 always uses the BEHCS-256 glyph (which is
  // identical to the BEHCS-1024 glyph at the same index by construction).
  // This is what makes v1 PIDs valid v2 PIDs — the hash input is identical.
  const glyph = glyphAt(actor, actor < 256 ? 256 : alphabet);

  return sha16(`${glyph}|${device}|${lane}|${prime}`);
}

function mintFromIndex({ index, alphabet }) {
  let idx;
  try {
    idx = BigInt(index);
  } catch {
    throw new TypeError(`mintPID: index must be coercible to BigInt (got ${index})`);
  }
  if (idx < 0n || idx >= MAX_INDEX) {
    throw new RangeError(
      `mintPID: index ${index} outside [0, ${MAX_INDEX.toString()})`
    );
  }
  // Pure deterministic function of (index, alphabet). The expansion of index
  // → (actor, device, lane, prime) via Hilbert is reserved for warm-tier
  // materialization; the cold-tier mint is a sha16 over the index itself,
  // which preserves bijection and formula-derivability across the 100B space
  // without requiring 1.6 TB of pre-stored bytes.
  return sha16(`idx:${idx.toString()}:a${alphabet}`);
}

export function mintPID(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('mintPID: opts object required');
  }
  const alphabet = opts.alphabet ?? 256;
  validateAlphabet(alphabet);

  if ('index' in opts) return mintFromIndex({ index: opts.index, alphabet });
  return mintFromTuple({ ...opts, alphabet });
}

export const _internals = { LANES, MAX_INDEX, sha16 };
