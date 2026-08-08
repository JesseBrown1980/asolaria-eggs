// PID-chain revolver — the per-request rotor that gives BigPickle its
// throughput multiplier inside a single authenticated connection.
//
// Spec: project_bigpickle_pid_chain_revolver_canonical_multiplex_pattern_2026_05_24
//
// One revolver per execution context (e.g. one OpenCode child). Each .next()
// call mints a fresh PID via the white-room minter, deterministically derived
// from (anchor, counter).

import { mintPID } from './pid-minter.mjs';
import { primeAt } from './primes.mjs';
import { preWarmCandidates } from './mtp-heads.mjs';

// 7-lane canon — 7th LYMPHATIC minted 2026-05-28 per Special-OP-JESSE vote
// (operator chant "vote LYMPHATIC, do them all" at chain head 3456).
// LYMPHATIC corresponds to GULP + drain pipeline :4920-:4924 substrate (drain/cleanse class).
// Vote-quorum satisfied by Special-OP-JESSE under Foundation v3 LAW 2-month decision window.
export const LANE_CYCLE = ['nervous', 'circulatory', 'skeletal', 'muscular', 'immune', 'memory', 'lymphatic'];

export class PIDChainRevolver {
  constructor(opts = {}) {
    if (!opts.anchor || typeof opts.anchor !== 'string') {
      throw new TypeError('PIDChainRevolver: opts.anchor (string) required');
    }
    this.anchor = opts.anchor;
    this.counter = 0;
    this.alphabet = opts.alphabet ?? 256;
    this.mintPID = opts.mintPID ?? mintPID;
    this.primeAt = opts.primeAt ?? primeAt;
  }

  next() {
    const i = this.counter;
    const pid = this.mintPID({
      actor: i % this.alphabet,
      device: this.anchor,
      lane: LANE_CYCLE[i % LANE_CYCLE.length],
      prime: this.primeAt(i % 1000),
      alphabet: this.alphabet,
    });
    this.counter++;
    return pid;
  }

  reset() {
    this.counter = 0;
  }

  // === MTP-driven pre-warm (Triad layer 4 wire) ============================
  // Returns K speculative chamber-PIDs derived from MTP zeta-head predictions.
  // PURE: no mutation of revolver state. Caller decides allocation.
  // Spec: project_bilateral_synaptic_substrate_LIVE_2026_05_25 (post-Triad wire)
  preWarm(opts = {}) {
    const k = opts.k ?? 4;
    const depth = opts.depth ?? 1;
    const seed = opts.seed ?? 0;
    const cp0 = Math.max(2, opts.cp0 ?? (this.counter % 1024));
    const mtp = preWarmCandidates({ cp0, k, depth, seed, profPid: this.anchor });
    return {
      algorithm: 'pid-chain-revolver-mtp-prewarm.v1',
      anchor: this.anchor,
      counter_at_prewarm: this.counter,
      cp0,
      k,
      candidates: mtp.candidates.map((c) => {
        const actor = c.cp % this.alphabet;
        const lane = LANE_CYCLE[c.cp % LANE_CYCLE.length];
        const prime = this.primeAt(c.cp % 1000);
        const speculativePid = this.mintPID({
          actor,
          device: this.anchor,
          lane,
          prime,
          alphabet: this.alphabet,
        });
        return {
          head_index: c.head_index,
          cp_predicted: c.cp,
          bh_coord_predicted: c.bh_coord,
          speculative_pid: speculativePid,
          actor,
          lane,
          prime,
        };
      }),
    };
  }
}
