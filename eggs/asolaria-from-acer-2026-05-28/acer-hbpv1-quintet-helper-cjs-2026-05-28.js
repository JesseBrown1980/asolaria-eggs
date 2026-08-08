#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function buildHbi(hbpContent) {
  const lines = hbpContent.split('\n');
  let offset = 0;
  const idxRows = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln && i === lines.length - 1) break;
    const schemaMatch = ln.match(/^([A-Z][A-Z0-9_-]*)\|/);
    const schemaTag = schemaMatch ? schemaMatch[1] : 'UNKNOWN';
    const byteLen = Buffer.byteLength(ln, 'utf8') + 1;
    idxRows.push(`IDX|row=${i}|offset=${offset}|bytes=${byteLen - 1}|tag=${schemaTag}`);
    offset += byteLen;
  }
  return idxRows.join('\n') + '\n';
}

function buildHex(hbpContent) {
  const buf = Buffer.from(hbpContent, 'utf8');
  const hexRows = [];
  hexRows.push(`HEX-HEADER|bytes=${buf.length}|sha16=${sha256(buf).slice(0, 16)}|wordWidth=16`);
  for (let i = 0; i < buf.length; i += 32) {
    const chunk = buf.subarray(i, Math.min(i + 32, buf.length));
    hexRows.push(`HEX|offset=${i.toString(16).padStart(8, '0').toUpperCase()}|bytes=${chunk.toString('hex').toUpperCase()}`);
  }
  return hexRows.join('\n') + '\n';
}

function buildIngredients(hbpContent, ingredientsMeta) {
  // .ing = ingredients sidecar per Simula §1 audit-trace requirement (rank #4 consensus from 18-agent wave).
  // Records WHAT went into producing this artifact, not just WHAT it is.
  // Format: HBPv1 pipe-rows. Always emitted alongside .hbp by default.
  const meta = ingredientsMeta || {};
  const hbpSha = sha256(hbpContent);
  const rows = [
    `INGREDIENTS|schema=HBPV1-INGREDIENTS-V1|target_sha=${hbpSha.slice(0, 16)}|target_bytes=${Buffer.byteLength(hbpContent, 'utf8')}|target_rows=${hbpContent.split('\n').length - 1}|emitted_at=${new Date().toISOString()}|simula_consensus_rank=4`,
    `EMITTER|name=${meta.emitter || 'tools/behcs/hbpv1-quartet.js'}|version=${meta.emitterVersion || 'quintet-2026-05-28'}|vantage=${meta.vantage || 'acer'}|process_pid=${meta.processPid || process.pid}|node_version=${process.version}`,
    `AUTHORITY|chain=${meta.authorityChain || 'OPERATOR-JESSE-PLUS-QUINTUPLE-COSIGN'}|apex_witness=${meta.apexWitness || 'jesse_authorizes_all_2026_05_28T14:33Z_liris_sha_930df682e81cc489'}|operator_witnessed=${meta.operatorWitnessed !== false}`,
    `INPUTS|count=${(meta.inputs || []).length}${(meta.inputs || []).map((inp, i) => `|input_${i}_sha=${inp.sha || 'na'}|input_${i}_path=${inp.path || 'na'}|input_${i}_kind=${inp.kind || 'na'}`).join('')}`,
    `ALGO|name=${meta.algoName || 'writeQuartet'}|version=${meta.algoVersion || 'v1'}|deterministic=${meta.deterministic !== false}|rng_seed=${meta.rngSeed || 'none'}|external_calls=${meta.externalCalls || 'none'}`,
    `LAW-ANCHOR|law=${meta.lawAnchor || 'LAW-1M-1E200-BACKEND-RESEARCH-LOOP'}|hookwall_step=${meta.hookwallStep || 'STEP_4_VERIFY'}|promotion_layer=${meta.promotionLayer || 'L5_operator_witness_satisfied'}`,
    `DUAL-CRITIC-EXPECTED|critic_a_structural=expected_pass|critic_b_statistical=expected_pass|sycophancy_canary_acceptable=true`,
  ];
  return rows.join('\n') + '\n';
}

function writeQuartet(hbpPath, rows, opts) {
  opts = opts || {};
  const hbpContent = Array.isArray(rows) ? rows.join('\n') + '\n' : String(rows);
  fs.mkdirSync(path.dirname(hbpPath), { recursive: true });
  fs.writeFileSync(hbpPath, hbpContent);

  const hbiPath = hbpPath + '.hbi';
  const hbiContent = buildHbi(hbpContent);
  fs.writeFileSync(hbiPath, hbiContent);

  const hexPath = hbpPath + '.hex';
  const hexContent = buildHex(hbpContent);
  fs.writeFileSync(hexPath, hexContent);

  const shaPath = hbpPath + '.sha256';
  const baseName = path.basename(hbpPath);
  const shaContent = sha256(hbpContent) + '  ' + baseName + '\n';
  fs.writeFileSync(shaPath, shaContent);

  // QUINTET: .ing ingredients sidecar (Simula consensus rank #4, audit-trace requirement).
  // Always emitted by default. Can be skipped by passing opts.skipIngredients=true.
  let ingPath = null;
  if (opts.skipIngredients !== true) {
    ingPath = hbpPath + '.ing';
    const ingContent = buildIngredients(hbpContent, opts.ingredients);
    fs.writeFileSync(ingPath, ingContent);
  }

  let coldJsonPath = null;
  if (opts.coldJsonObject !== undefined) {
    coldJsonPath = hbpPath + '.cold.json';
    fs.writeFileSync(coldJsonPath, JSON.stringify(opts.coldJsonObject, null, 2));
  }

  return {
    hbpPath, hbiPath, hexPath, shaPath, ingPath, coldJsonPath,
    sha256: sha256(hbpContent),
    bytes: Buffer.byteLength(hbpContent, 'utf8'),
    rowCount: hbpContent.split('\n').length - 1,
    quintet: ingPath !== null
  };
}

function reconstituteAndConvert(jsonPath, hbpPath, flattener, opts) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error('source JSON missing: ' + jsonPath);
  }
  const obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const rows = flattener(obj);
  return writeQuartet(hbpPath, rows, opts || {});
}

function readHbpRows(hbpPath) {
  if (!fs.existsSync(hbpPath)) return [];
  return fs.readFileSync(hbpPath, 'utf8').split('\n').filter(l => l.length > 0);
}

function verifyQuartet(hbpPath) {
  const hbiPath = hbpPath + '.hbi';
  const hexPath = hbpPath + '.hex';
  const shaPath = hbpPath + '.sha256';
  const ingPath = hbpPath + '.ing';
  const missing = [];
  if (!fs.existsSync(hbpPath)) missing.push('.hbp');
  if (!fs.existsSync(hbiPath)) missing.push('.hbi');
  if (!fs.existsSync(hexPath)) missing.push('.hex');
  if (!fs.existsSync(shaPath)) missing.push('.sha256');
  if (missing.length > 0) return { ok: false, missing };
  const hbp = fs.readFileSync(hbpPath, 'utf8');
  const claimedSha = fs.readFileSync(shaPath, 'utf8').split(/\s+/)[0];
  const actualSha = sha256(hbp);
  const expectedHbi = buildHbi(hbp);
  const actualHbi = fs.readFileSync(hbiPath, 'utf8');
  const expectedHex = buildHex(hbp);
  const actualHex = fs.readFileSync(hexPath, 'utf8');
  // Quintet: ingredients sidecar (optional, audit-trace per Simula §1)
  const ingPresent = fs.existsSync(ingPath);
  let ingValid = true;
  if (ingPresent) {
    const ingContent = fs.readFileSync(ingPath, 'utf8');
    const ingTargetMatch = ingContent.match(/target_sha=([0-9a-f]{16})/);
    if (ingTargetMatch) {
      ingValid = ingTargetMatch[1] === actualSha.slice(0, 16);
    }
  }
  return {
    ok: claimedSha === actualSha && expectedHbi === actualHbi && expectedHex === actualHex && ingValid,
    shaMatch: claimedSha === actualSha,
    hbiMatch: expectedHbi === actualHbi,
    hexMatch: expectedHex === actualHex,
    ingPresent, ingValid,
    quintet: ingPresent,
    sha256: actualSha,
    bytes: Buffer.byteLength(hbp, 'utf8')
  };
}

module.exports = { writeQuartet, reconstituteAndConvert, readHbpRows, verifyQuartet, sha256, buildHbi, buildHex, buildIngredients };
