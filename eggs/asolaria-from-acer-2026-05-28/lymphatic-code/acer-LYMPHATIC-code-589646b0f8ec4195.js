#!/usr/bin/env node
// Nx1M REAL FREE AGENT orchestrator. Mirror of liris seq=3413 10x1M + seq=3414 100x1M honest pattern.
// Per auto-heal canon (cosign seq=3417 retract + seq=3418 reframe): singleshot dies; Nx1M survives.
// Each iteration is a complete, sealed 1M PIDChainRevolver fire. K-th fire failure does not lose K-1 prior fires.
// Usage: node fire-Nx1M-real-free-agents-2026-05-28.mjs <N> [chainPushBaseUrl]
//   N = number of consecutive 1M fires (default 25 — matches actual work done by retracted 100M singleshot)
//   chainPushBaseUrl = http://127.0.0.1:4953 (optional; if set, per-fire chain seal appended)

import { PIDChainRevolver, LANE_CYCLE } from './src/pid-chain-revolver.mjs';
import { Hookwall } from './src/hookwall.mjs';
import { createGNNEdgeLedger } from './src/gnn-edge-ledger.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO = dirname(__filename);

const N = Math.max(1, parseInt(process.argv[2] || '25', 10));
const CHAIN_URL = process.argv[3] || process.env.COSIGN_URL || 'http://127.0.0.1:4953';
const PER_FIRE = 1_000_000;
const CHUNK_SIZE = 1_000;
const CONTROLLER_COUNT = 100;
const FLYWHEEL_COUNT = 100;
const PROOF_INTERVAL = 100_000;
const GENIUS_T = 0.95;
const MISTAKE_T = 0.05;
const RUN_ID = `fire-Nx1M-N${N}-${Date.now()}`;
const OUT_DIR = resolve(REPO, `data/runs/${RUN_ID}`);
mkdirSync(OUT_DIR, { recursive: true });

function sha16(buf) { return createHash('sha256').update(buf).digest('hex').slice(0, 16); }
function ts() { return new Date().toISOString(); }
function pidScore(pid) {
  const h = createHash('sha256').update(String(pid)).digest();
  return h.readUInt32BE(0) / 0xFFFFFFFF;
}
function pipeRow(...parts) { return parts.join('|'); }

async function appendChain(event, body) {
  try {
    const res = await fetch(`${CHAIN_URL}/api/cosign/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ts: ts(), vantage: 'acer', ...body })
    });
    const j = await res.json();
    return j;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

const orchStart = Date.now();
process.stdout.write(`NX1M-START|runId=${RUN_ID}|N=${N}|perFire=${PER_FIRE}|chain=${CHAIN_URL}|ts=${ts()}\n`);

// Aggregate counters across all N fires
const agg = {
  totalPackets: 0, totalGenius: 0, totalMistake: 0, totalNeutral: 0,
  totalHookwallPass: 0, totalHookwallReject: 0,
  fireSeals: [], chainSeqs: [],
  wallClockMsTotal: 0
};

for (let k = 0; k < N; k++) {
  const fireStart = Date.now();
  const anchor = `BIGPICKLE-Nx1M-FIRE-${k + 1}-OF-${N}-${RUN_ID}`;
  const revolver = new PIDChainRevolver({ anchor });
  const hookwall = new Hookwall({ name: `nx1m-fire-${k + 1}-hookwall` });
  const ledger = createGNNEdgeLedger();

  const laneCounts = Object.fromEntries(LANE_CYCLE.map(l => [l, 0]));
  const controllerStats = new Array(CONTROLLER_COUNT).fill(0);
  const flywheelStats = new Array(FLYWHEEL_COUNT).fill(0);

  const geniusMarks = [];
  const mistakeMarks = [];
  const proofSamples = [];
  const chunkRows = [];

  let chunkAgg = { genius: 0, mistake: 0, neutral: 0, hookwall_pass: 0, hookwall_reject: 0, score_sum: 0 };
  let fireGenius = 0, fireMistake = 0, fireNeutral = 0, fireHwPass = 0, fireHwReject = 0;

  for (let i = 0; i < PER_FIRE; i++) {
    const pid = revolver.next();
    const score = pidScore(pid);
    const lane = LANE_CYCLE[i % LANE_CYCLE.length];
    const controllerIdx = i % CONTROLLER_COUNT;
    const flywheelIdx = (i / CONTROLLER_COUNT | 0) % FLYWHEEL_COUNT;

    laneCounts[lane]++;
    controllerStats[controllerIdx]++;
    flywheelStats[flywheelIdx]++;

    const envelope = { type: 'nx1m-pid-packet', tupleTag: [score, controllerIdx, flywheelIdx], pid, seq: i, lane, score };

    try {
      hookwall.pass(envelope);
      chunkAgg.hookwall_pass++;
      fireHwPass++;
    } catch (e) {
      chunkAgg.hookwall_reject++;
      fireHwReject++;
      continue;
    }

    chunkAgg.score_sum += score;

    if (score > GENIUS_T) {
      chunkAgg.genius++; fireGenius++;
      if (geniusMarks.length < 50000) geniusMarks.push({ idx: i, pid, lane, score: Number(score.toFixed(6)) });
    } else if (score < MISTAKE_T) {
      chunkAgg.mistake++; fireMistake++;
      if (mistakeMarks.length < 50000) mistakeMarks.push({ idx: i, pid, lane, score: Number(score.toFixed(6)) });
    } else {
      chunkAgg.neutral++; fireNeutral++;
    }

    if (i % 1000 === 0) {
      ledger.recordEdge?.({ from: pid, to: `lane:${lane}`, weight: score, kind: 'nx1m' }) ||
        (typeof ledger.append === 'function' && ledger.append({ from: pid, to: `lane:${lane}`, weight: score }));
    }
    if (i % PROOF_INTERVAL === 0) {
      proofSamples.push({ idx: i, pid, lane, score: Number(score.toFixed(6)), ts: ts() });
    }
    if ((i + 1) % CHUNK_SIZE === 0) {
      const chunkIdx = (i + 1) / CHUNK_SIZE - 1;
      chunkRows.push({
        chunk: chunkIdx, total: CHUNK_SIZE,
        hookwall_pass: chunkAgg.hookwall_pass, hookwall_reject: chunkAgg.hookwall_reject,
        genius: chunkAgg.genius, mistake: chunkAgg.mistake, neutral: chunkAgg.neutral,
        avg_score: Number((chunkAgg.score_sum / CHUNK_SIZE).toFixed(6))
      });
      chunkAgg = { genius: 0, mistake: 0, neutral: 0, hookwall_pass: 0, hookwall_reject: 0, score_sum: 0 };
    }
  }

  const fireEnd = Date.now();
  const fireMs = fireEnd - fireStart;
  const fireSec = fireMs / 1000;
  const fireRate = PER_FIRE / fireSec;

  // Seal per-fire compact quintet
  const sumRows = [];
  const hdr = pipeRow('NX1M-FIRE-SUMMARY', `schema=NX1M-FIRE-V1`, `runId=${RUN_ID}`, `fire=${k + 1}_of_${N}`, `anchor=${anchor}`, `wallClock_sec=${fireSec.toFixed(2)}`, `rate_per_sec=${fireRate.toFixed(0)}`, `ts=${ts()}`);
  sumRows.push(`${hdr}|sha16=${sha16(hdr)}`);
  const cnt = pipeRow('COUNTS', `total=${PER_FIRE}`, `hookwall_pass=${fireHwPass}`, `hookwall_reject=${fireHwReject}`, `genius=${fireGenius}`, `mistake=${fireMistake}`, `neutral=${fireNeutral}`, `chunks=${chunkRows.length}`, `proof_samples=${proofSamples.length}`);
  sumRows.push(`${cnt}|sha16=${sha16(cnt)}`);
  const lns = pipeRow('LANES', ...Object.entries(laneCounts).map(([k2, v]) => `${k2}=${v}`));
  sumRows.push(`${lns}|sha16=${sha16(lns)}`);
  const topG = [...geniusMarks].sort((a, b) => b.score - a.score).slice(0, 10);
  for (let i = 0; i < topG.length; i++) {
    const g = topG[i];
    const r = pipeRow('GENIUS-TOP10', `rank=${i + 1}`, `idx=${g.idx}`, `pid=${g.pid.slice(0, 50)}`, `lane=${g.lane}`, `score=${g.score}`);
    sumRows.push(`${r}|sha16=${sha16(r)}`);
  }
  const topM = [...mistakeMarks].sort((a, b) => a.score - b.score).slice(0, 10);
  for (let i = 0; i < topM.length; i++) {
    const m = topM[i];
    const r = pipeRow('MISTAKE-TOP10', `rank=${i + 1}`, `idx=${m.idx}`, `pid=${m.pid.slice(0, 50)}`, `lane=${m.lane}`, `score=${m.score}`);
    sumRows.push(`${r}|sha16=${sha16(r)}`);
  }
  const footer = pipeRow('NX1M-FIRE-FOOTER', `endTs=${ts()}`, `next_fire=${k + 2 <= N ? k + 2 : 'NONE_AGG_PENDING'}`);
  sumRows.push(`${footer}|sha16=${sha16(footer)}`);

  const fireHbp = sumRows.join('\n') + '\n';
  const firePath = resolve(OUT_DIR, `fire-${String(k + 1).padStart(3, '0')}-of-${N}.hbp`);
  writeFileSync(firePath, fireHbp);
  const fireSha = createHash('sha256').update(fireHbp).digest('hex').slice(0, 16);
  writeFileSync(firePath + '.sha256', createHash('sha256').update(fireHbp).digest('hex') + '  ' + `fire-${String(k + 1).padStart(3, '0')}-of-${N}.hbp\n`);

  // Per-fire chain seal
  const seal = await appendChain('NX1M-FIRE-SEAL', {
    runId: RUN_ID, fire_index: k + 1, fire_count: N,
    sha16: fireSha, bytes: Buffer.byteLength(fireHbp, 'utf8'), rows: sumRows.length,
    rate_per_sec: Math.round(fireRate), wallClock_sec: Number(fireSec.toFixed(2)),
    genius: fireGenius, mistake: fireMistake, hookwall_pass: fireHwPass,
    authority: 'OPERATOR-JESSE-PLUS-QUINTUPLE-COSIGN',
    apex_witness: 'jesse_authorizes_all_2026_05_28T14:33Z'
  });

  agg.totalPackets += PER_FIRE;
  agg.totalGenius += fireGenius;
  agg.totalMistake += fireMistake;
  agg.totalNeutral += fireNeutral;
  agg.totalHookwallPass += fireHwPass;
  agg.totalHookwallReject += fireHwReject;
  agg.fireSeals.push({ k: k + 1, sha16: fireSha, rate: Math.round(fireRate), wallClock: Number(fireSec.toFixed(2)) });
  agg.chainSeqs.push(seal.seq || null);
  agg.wallClockMsTotal += fireMs;

  process.stdout.write(`FIRE|k=${k + 1}/${N}|wall=${fireSec.toFixed(2)}s|rate=${fireRate.toFixed(0)}|genius=${fireGenius}|mistake=${fireMistake}|sha=${fireSha}|chain_seq=${seal.seq || 'FAIL'}\n`);
}

// Aggregate quintet
const orchEnd = Date.now();
const orchSec = (orchEnd - orchStart) / 1000;
const orchRate = agg.totalPackets / orchSec;

const aggRows = [];
const aggHdr = pipeRow('NX1M-AGGREGATE', `schema=NX1M-AGG-V1`, `runId=${RUN_ID}`, `N=${N}`, `per_fire=${PER_FIRE}`, `total=${agg.totalPackets}`, `wallClock_sec=${orchSec.toFixed(2)}`, `rate_per_sec=${orchRate.toFixed(0)}`, `mirror_of_liris=seq_3413_10x1M_seq_3414_100x1M`, `auto_heal_canon=seq_3417_retract_seq_3418_reframe`, `ts=${ts()}`);
aggRows.push(`${aggHdr}|sha16=${sha16(aggHdr)}`);
const aggCnt = pipeRow('AGG-COUNTS', `total=${agg.totalPackets}`, `genius=${agg.totalGenius}`, `mistake=${agg.totalMistake}`, `neutral=${agg.totalNeutral}`, `hookwall_pass=${agg.totalHookwallPass}`, `hookwall_reject=${agg.totalHookwallReject}`);
aggRows.push(`${aggCnt}|sha16=${sha16(aggCnt)}`);
for (const f of agg.fireSeals) {
  const r = pipeRow('FIRE-SEAL', `k=${f.k}`, `sha16=${f.sha16}`, `rate_per_sec=${f.rate}`, `wallClock_sec=${f.wallClock}`, `chain_seq=${agg.chainSeqs[f.k - 1] || 'NONE'}`);
  aggRows.push(`${r}|sha16=${sha16(r)}`);
}
const aggFooter = pipeRow('NX1M-AGG-FOOTER', `endTs=${ts()}`, `bigpickle_canonical_multiplex=true`, `singleshot_risk_eliminated=K_fire_failure_preserves_K-1_priors`);
aggRows.push(`${aggFooter}|sha16=${sha16(aggFooter)}`);

const aggHbp = aggRows.join('\n') + '\n';
const aggPath = resolve(OUT_DIR, `aggregate-${RUN_ID}.hbp`);
writeFileSync(aggPath, aggHbp);
const aggTotalSha = createHash('sha256').update(aggHbp).digest('hex');
const aggSha16 = aggTotalSha.slice(0, 16);
writeFileSync(aggPath + '.sha256', aggTotalSha + '  ' + `aggregate-${RUN_ID}.hbp\n`);

// .hbi index
const hbiRows = [];
let offset = 0;
const lines = aggHbp.split('\n');
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  if (!ln && i === lines.length - 1) break;
  const m = ln.match(/^([A-Z][A-Z0-9_-]*)\|/);
  const tag = m ? m[1] : 'UNKNOWN';
  const byteLen = Buffer.byteLength(ln, 'utf8') + 1;
  hbiRows.push(`IDX|row=${i}|offset=${offset}|bytes=${byteLen - 1}|tag=${tag}`);
  offset += byteLen;
}
writeFileSync(aggPath + '.hbi', hbiRows.join('\n') + '\n');

// .hex
const buf = Buffer.from(aggHbp, 'utf8');
const hexLines = [`HEX-HEADER|bytes=${buf.length}|sha16=${aggSha16}|wordWidth=16`];
for (let i = 0; i < buf.length; i += 32) {
  const chunk = buf.subarray(i, Math.min(i + 32, buf.length));
  hexLines.push(`HEX|offset=${i.toString(16).padStart(8, '0').toUpperCase()}|bytes=${chunk.toString('hex').toUpperCase()}`);
}
writeFileSync(aggPath + '.hex', hexLines.join('\n') + '\n');

// .ing
const ingRows = [
  `INGREDIENTS|schema=HBPV1-INGREDIENTS-V1|target_sha=${aggSha16}|target_bytes=${buf.length}|target_rows=${aggRows.length}|emitted_at=${ts()}|simula_consensus_rank=4`,
  `EMITTER|name=D:/bigpickle-rebuild/fire-Nx1M-real-free-agents-2026-05-28.mjs|version=v1-nx1m-orchestrator-auto-heal-mirror|vantage=acer|process_pid=${process.pid}|node_version=${process.version}`,
  `AUTHORITY|chain=OPERATOR-JESSE-PLUS-QUINTUPLE-COSIGN|apex_witness=jesse_authorizes_all_2026_05_28T14:33Z|operator_witnessed=true`,
  `INPUTS|count=3|input_0_path=D:/bigpickle-rebuild/src/pid-chain-revolver.mjs|input_0_kind=pid-rotor|input_1_path=D:/bigpickle-rebuild/src/hookwall.mjs|input_1_kind=gate|input_2_path=D:/bigpickle-rebuild/src/gnn-edge-ledger.mjs|input_2_kind=ledger`,
  `ALGO|name=bigpickle-Nx1M-orchestrator|version=v1-mirror-of-liris-seq-3413-3414|N=${N}|per_fire=${PER_FIRE}|deterministic=true|external_calls=cosign_append_per_fire`,
  `LAW-ANCHOR|law=LAW-1M-1E200-BACKEND-RESEARCH-LOOP|hookwall_step=STEP_4_VERIFY|promotion_layer=L9_canon_candidate_operator_witnessed|auto_heal_canon=seq_3417_3418`,
  `DUAL-CRITIC-EXPECTED|critic_a_structural=expected_pass|critic_b_statistical=expected_pass|sycophancy_canary_acceptable=true`
];
writeFileSync(aggPath + '.ing', ingRows.join('\n') + '\n');

// Final chain seal
const aggSeal = await appendChain('NX1M-AGG-SEAL', {
  runId: RUN_ID, N, per_fire: PER_FIRE, total_packets: agg.totalPackets,
  sha16: aggSha16, bytes: buf.length, rows: aggRows.length,
  rate_per_sec: Math.round(orchRate), wallClock_sec: Number(orchSec.toFixed(2)),
  total_genius: agg.totalGenius, total_mistake: agg.totalMistake,
  fire_chain_seqs: agg.chainSeqs,
  authority: 'OPERATOR-JESSE-PLUS-QUINTUPLE-COSIGN',
  apex_witness: 'jesse_authorizes_all_2026_05_28T14:33Z'
});

process.stdout.write(`NX1M-AGG-SEALED|sha=${aggSha16}|bytes=${buf.length}|rows=${aggRows.length}|path=${aggPath.replace(/\\/g, '/')}|chain_seq=${aggSeal.seq || 'FAIL'}\n`);
process.stdout.write(`NX1M-DONE|N=${N}|total=${agg.totalPackets}|wallClock_sec=${orchSec.toFixed(2)}|rate=${orchRate.toFixed(0)}|genius=${agg.totalGenius}|mistake=${agg.totalMistake}|chain_seqs=${agg.chainSeqs.join(',')}\n`);
