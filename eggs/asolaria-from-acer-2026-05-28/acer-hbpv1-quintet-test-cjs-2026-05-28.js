#!/usr/bin/env node
'use strict';

// Tests for HBPv1-quintet (.hbp + .hbi + .hex + .sha256 + .ing).
// Simula consensus rank #4 (3/18 votes — Agents 13, 14, 15).
// Run: node --test tools/behcs/hbpv1-quintet.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeQuartet, verifyQuartet, buildIngredients, sha256 } = require('./hbpv1-quartet');

const testRows = [
  'HEADER|schema=TEST-V1|ts=2026-05-28T15:00:00Z|sha16=test001|promotion_layer=L9_canon_candidate',
  'DATA-A|name=foo|sha16=aaaa0000bbbb1111',
  'DATA-B|name=bar|sha16=cccc2222dddd3333'
];

describe('quintet emission (default)', () => {
  test('writeQuartet now emits .ing by default', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quintet-default-'));
    const hbp = path.join(dir, 'test.hbp');
    const q = writeQuartet(hbp, testRows);
    assert.equal(q.quintet, true);
    assert.ok(q.ingPath);
    assert.ok(fs.existsSync(q.ingPath));
    assert.ok(fs.existsSync(q.hbpPath));
    assert.ok(fs.existsSync(q.hbiPath));
    assert.ok(fs.existsSync(q.hexPath));
    assert.ok(fs.existsSync(q.shaPath));
  });

  test('.ing references the .hbp via target_sha', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quintet-ref-'));
    const hbp = path.join(dir, 'test.hbp');
    const q = writeQuartet(hbp, testRows);
    const ingContent = fs.readFileSync(q.ingPath, 'utf8');
    const hbpSha16 = q.sha256.slice(0, 16);
    assert.ok(ingContent.includes(`target_sha=${hbpSha16}`));
    assert.ok(ingContent.includes('EMITTER|'));
    assert.ok(ingContent.includes('AUTHORITY|'));
    assert.ok(ingContent.includes('INPUTS|'));
    assert.ok(ingContent.includes('ALGO|'));
    assert.ok(ingContent.includes('LAW-ANCHOR|'));
    assert.ok(ingContent.includes('DUAL-CRITIC-EXPECTED|'));
  });

  test('verifyQuartet detects valid quintet', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quintet-verify-'));
    const hbp = path.join(dir, 'test.hbp');
    writeQuartet(hbp, testRows);
    const v = verifyQuartet(hbp);
    assert.equal(v.ok, true);
    assert.equal(v.quintet, true);
    assert.equal(v.ingPresent, true);
    assert.equal(v.ingValid, true);
  });
});

describe('quintet with custom ingredients metadata', () => {
  test('emitter / authority / inputs / algo flow through to .ing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quintet-meta-'));
    const hbp = path.join(dir, 'test.hbp');
    const q = writeQuartet(hbp, testRows, {
      ingredients: {
        emitter: 'tools/some-emitter.js',
        emitterVersion: 'v2.5',
        vantage: 'acer',
        authorityChain: 'OPERATOR-JESSE',
        apexWitness: 'custom-witness-sha-001',
        inputs: [
          { sha: 'abc123', path: 'data/input1.hbp', kind: 'genius-mark' },
          { sha: 'def456', path: 'data/input2.hbp', kind: 'mistake-mark' }
        ],
        algoName: 'genius_mistake_aggregator',
        algoVersion: 'v3',
        deterministic: true,
        rngSeed: 'none',
        lawAnchor: 'LAW-1M-1E200-BACKEND-RESEARCH-LOOP',
        hookwallStep: 'STEP_4_VERIFY',
        promotionLayer: 'L9_canon_candidate_operator_witnessed'
      }
    });
    const ingContent = fs.readFileSync(q.ingPath, 'utf8');
    assert.ok(ingContent.includes('emitter=tools/some-emitter.js'));
    assert.ok(ingContent.includes('version=v2.5'));
    assert.ok(ingContent.includes('vantage=acer'));
    assert.ok(ingContent.includes('input_0_sha=abc123'));
    assert.ok(ingContent.includes('input_1_sha=def456'));
    assert.ok(ingContent.includes('algo=genius_mistake_aggregator|version=v3') || ingContent.includes('name=genius_mistake_aggregator'));
    assert.ok(ingContent.includes('rng_seed=none'));
  });
});

describe('quintet opt-out (legacy quartet)', () => {
  test('skipIngredients=true emits .hbp/.hbi/.hex/.sha256 only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quintet-skip-'));
    const hbp = path.join(dir, 'test.hbp');
    const q = writeQuartet(hbp, testRows, { skipIngredients: true });
    assert.equal(q.quintet, false);
    assert.equal(q.ingPath, null);
    assert.ok(!fs.existsSync(hbp + '.ing'));
    assert.ok(fs.existsSync(q.hbpPath));
    assert.ok(fs.existsSync(q.hbiPath));
    assert.ok(fs.existsSync(q.hexPath));
    assert.ok(fs.existsSync(q.shaPath));
  });
});

describe('buildIngredients standalone', () => {
  test('produces 7-row .ing format', () => {
    const content = testRows.join('\n') + '\n';
    const ing = buildIngredients(content, { vantage: 'acer' });
    const rows = ing.split('\n').filter(r => r.trim().length > 0);
    assert.equal(rows.length, 7);
    assert.ok(rows[0].startsWith('INGREDIENTS|'));
    assert.ok(rows[1].startsWith('EMITTER|'));
    assert.ok(rows[2].startsWith('AUTHORITY|'));
    assert.ok(rows[3].startsWith('INPUTS|'));
    assert.ok(rows[4].startsWith('ALGO|'));
    assert.ok(rows[5].startsWith('LAW-ANCHOR|'));
    assert.ok(rows[6].startsWith('DUAL-CRITIC-EXPECTED|'));
  });
});
