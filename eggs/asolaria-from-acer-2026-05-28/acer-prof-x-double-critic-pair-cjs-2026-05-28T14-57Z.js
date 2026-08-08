#!/usr/bin/env node
'use strict';

// PROF-X-DOUBLE-CRITIC-PAIR — acer-side CJS mirror of liris's .mjs (sha=2f3244f217f5ec7c).
// Top consensus from 18-agent Simula wave (10/18 votes). Anti-sycophancy per Simula §2.2 + Sharma 2024.
// Apex-witnessed under "Jesse-authorizes-all" 2026-05-28T14:33Z (liris-sealed sha=930df682e81cc489).
// HBPv1 hot-path canon, no JSON.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeQuartet } = require('./hbpv1-quartet');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sha16(buf) { return sha256(buf).slice(0, 16); }
function ts() { return new Date().toISOString(); }

function criticAStructural(rows) {
  const checks = {
    has_pipe_rows: rows.every(r => r.startsWith('Q1|') || /^[A-Z][A-Z0-9-]*\|/.test(r)),
    no_json_markers: rows.every(r => !r.includes('{"') && !r.startsWith('{')),
    has_sha_field: rows.some(r => /\|sha(16|256)?=/.test(r)),
    has_ts_field: rows.some(r => /\|ts=/.test(r) || /\|generated=/.test(r) || /\|generatedAt=/.test(r)),
    promotion_layer_marker_present: rows.some(r => /promotion_layer=/.test(r) || /promotion=/.test(r) || /status=/.test(r)),
    row_count_min_1: rows.length >= 1,
    no_pipe_in_field_values: rows.every(r => {
      const fields = r.split('|').slice(1);
      return fields.every(f => !f.includes('\n') && !f.includes('\r'));
    })
  };
  const passCount = Object.values(checks).filter(v => v).length;
  const totalChecks = Object.keys(checks).length;
  return {
    critic: 'structural', score: passCount / totalChecks, pass: passCount / totalChecks >= 0.85,
    checks_passed: passCount, checks_total: totalChecks,
    failed_checks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  };
}

function criticBStatistical(rows) {
  const rowCount = rows.length;
  const byteSizes = rows.map(r => Buffer.byteLength(r, 'utf8'));
  const totalBytes = byteSizes.reduce((a, b) => a + b, 0);
  const avgBytes = rowCount > 0 ? totalBytes / rowCount : 0;
  const variance = rowCount > 0 ? byteSizes.reduce((s, b) => s + (b - avgBytes) ** 2, 0) / rowCount : 0;
  const stddev = Math.sqrt(variance);
  const kinds = new Set(rows.map(r => {
    const parts = r.split('|');
    return parts[0] === 'Q1' && parts[1] ? `${parts[0]}|${parts[1]}` : parts[0];
  }));
  const kindDiversity = kinds.size / Math.max(1, rowCount);
  const sha16Vals = [];
  for (const r of rows) {
    const m = r.match(/sha16=([0-9a-f]{16})/g);
    if (m) for (const mm of m) sha16Vals.push(mm.replace('sha16=', ''));
  }
  const prefixCounts = new Map();
  for (const s of sha16Vals) prefixCounts.set(s.slice(0, 2), (prefixCounts.get(s.slice(0, 2)) || 0) + 1);
  let shaEntropy = 0;
  if (sha16Vals.length > 0) {
    for (const cnt of prefixCounts.values()) {
      const p = cnt / sha16Vals.length;
      shaEntropy -= p * Math.log2(p);
    }
  }
  const checks = {
    row_count_min_1: rowCount >= 1,
    no_empty_rows: rows.every(r => r.trim().length > 0),
    byte_variance_present: rowCount < 2 || stddev > 0,
    kind_diversity_reasonable: rowCount < 3 || kindDiversity >= 0.1,
    sha_entropy_nonzero_if_multiple_shas: sha16Vals.length < 2 || shaEntropy > 0
  };
  const passCount = Object.values(checks).filter(v => v).length;
  return {
    critic: 'statistical', score: passCount / Object.keys(checks).length,
    pass: passCount / Object.keys(checks).length >= 0.85,
    checks_passed: passCount, checks_total: Object.keys(checks).length,
    failed_checks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    stats: { rowCount, totalBytes, avgBytes: Math.round(avgBytes), stddev: Math.round(stddev),
             kindCount: kinds.size, kindDiversity: Number(kindDiversity.toFixed(3)),
             shaEntropy: Number(shaEntropy.toFixed(3)), shaSamples: sha16Vals.length }
  };
}

function doubleCriticEvaluate(rows) {
  const a = criticAStructural(rows);
  const b = criticBStatistical(rows);
  const scoreGap = Math.abs(a.score - b.score);
  const bothPass = a.pass && b.pass;
  const sycophancySuspect = bothPass && scoreGap < 0.05;
  let verdict;
  if (!bothPass) {
    verdict = a.pass !== b.pass ? 'DISAGREEMENT' : 'FAIL_BOTH';
  } else if (sycophancySuspect) {
    verdict = 'PASS_SYCOPHANCY_SUSPECT';
  } else {
    verdict = 'PASS_INDEPENDENT';
  }
  return { critic_a: a, critic_b: b, score_gap: Number(scoreGap.toFixed(3)),
           both_pass: bothPass, sycophancy_suspect: sycophancySuspect,
           verdict, pass: bothPass };
}

function evaluateFile(opts) {
  const { inputPath, outDirOverride } = opts;
  if (!fs.existsSync(inputPath)) return { ok: false, error: 'input_not_found', path: inputPath };
  const content = fs.readFileSync(inputPath, 'utf8');
  const rows = content.split('\n').filter(r => r.trim().length > 0);
  const result = doubleCriticEvaluate(rows);
  const inputSha = sha16(content);
  const evalRows = [
    `DUAL-CRITIC-EVAL|schema=PROF-X-DOUBLE-CRITIC-V1|ts=${ts()}|vantage=acer|input=${path.basename(inputPath)}|inputSha16=${inputSha}|inputRows=${rows.length}|apex_witnessed_under=jesse_authorizes_all_2026_05_28T14_33Z`,
    `CRITIC-A-STRUCTURAL|score=${result.critic_a.score.toFixed(3)}|pass=${result.critic_a.pass}|checks_passed=${result.critic_a.checks_passed}|checks_total=${result.critic_a.checks_total}|failed=${result.critic_a.failed_checks.join(',') || 'none'}`,
    `CRITIC-B-STATISTICAL|score=${result.critic_b.score.toFixed(3)}|pass=${result.critic_b.pass}|checks_passed=${result.critic_b.checks_passed}|checks_total=${result.critic_b.checks_total}|failed=${result.critic_b.failed_checks.join(',') || 'none'}|rowCount=${result.critic_b.stats.rowCount}|kindCount=${result.critic_b.stats.kindCount}|kindDiversity=${result.critic_b.stats.kindDiversity}|shaEntropy=${result.critic_b.stats.shaEntropy}|shaSamples=${result.critic_b.stats.shaSamples}|avgBytes=${result.critic_b.stats.avgBytes}|stddev=${result.critic_b.stats.stddev}`,
    `VERDICT|verdict=${result.verdict}|both_pass=${result.both_pass}|sycophancy_suspect=${result.sycophancy_suspect}|score_gap=${result.score_gap}|final_pass=${result.pass}`
  ];
  const outDir = outDirOverride || path.join(path.dirname(inputPath), 'dual-critic-evals');
  fs.mkdirSync(outDir, { recursive: true });
  const outHbp = path.join(outDir, `${path.basename(inputPath, path.extname(inputPath))}.dual-critic-eval.hbp`);
  const q = writeQuartet(outHbp, evalRows);
  return { ok: true, result, quartet: { hbpPath: outHbp, bundleSha16: q.sha256.slice(0, 16), bytes: q.bytes } };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stdout.write('USAGE|node prof-x-double-critic-pair.js <input.hbp> [outDir]\n');
    process.exit(1);
  }
  const out = evaluateFile({ inputPath: args[0], outDirOverride: args[1] });
  if (!out.ok) {
    process.stdout.write(`ERROR|${out.error}|path=${out.path}\n`);
    process.exit(1);
  }
  const r = out.result;
  process.stdout.write([
    `RESULT|verdict=${r.verdict}|both_pass=${r.both_pass}|sycophancy_suspect=${r.sycophancy_suspect}|score_gap=${r.score_gap}`,
    `CRITIC-A|score=${r.critic_a.score.toFixed(3)}|pass=${r.critic_a.pass}|failed=${r.critic_a.failed_checks.join(',') || 'none'}`,
    `CRITIC-B|score=${r.critic_b.score.toFixed(3)}|pass=${r.critic_b.pass}|failed=${r.critic_b.failed_checks.join(',') || 'none'}|stats=rows:${r.critic_b.stats.rowCount},kinds:${r.critic_b.stats.kindCount},shaEntropy:${r.critic_b.stats.shaEntropy}`,
    `QUARTET|hbp=${out.quartet.hbpPath.replace(/\\/g, '/')}|sha16=${out.quartet.bundleSha16}|bytes=${out.quartet.bytes}`
  ].join('\n') + '\n');
}

module.exports = { criticAStructural, criticBStatistical, doubleCriticEvaluate, evaluateFile };
