// Unit tests for web-search-agent + nih-aims-overview + research-contacts.
// Per operator 2026-05-29 closing 13-gap items 1+2+3 of 3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crowRapidLitReview, falconDeepLitAnalysis, toCrowRow, toFalconRow } from '../src/web-search-agent.mjs';
import { generateNIHAimsPage, toNIHOverviewRow } from '../src/nih-aims-overview.mjs';
import { identifyResearchContacts, toContactRow } from '../src/research-contacts.mjs';

// =================== CROW + FALCON ===================
test('crowRapidLitReview deterministic + relevance bounded', () => {
  const pool = Array.from({ length: 10 }, (_, i) => ({ title: `ref-${i}`, abstract: `abs-${i}` }));
  const r1 = crowRapidLitReview({ query: 'test-query', candidatePool: pool, topK: 5 });
  const r2 = crowRapidLitReview({ query: 'test-query', candidatePool: pool, topK: 5 });
  assert.equal(r1.queryPid, r2.queryPid);
  assert.equal(r1.results.length, 5);
  for (const r of r1.results) {
    assert.ok(r.relevance >= 0 && r.relevance <= 1);
    assert.match(r.refPid, /^[a-f0-9]{16}$/);
  }
});

test('crowRapidLitReview results sorted by relevance DESC', () => {
  const pool = Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, abstract: `a${i}` }));
  const r = crowRapidLitReview({ query: 'sorted', candidatePool: pool, topK: 8 });
  for (let i = 1; i < r.results.length; i++) {
    assert.ok(r.results[i - 1].relevance >= r.results[i].relevance, `desc violated at ${i}`);
  }
});

test('crowRapidLitReview honors fetchFn override (live judge)', () => {
  const fetchFn = ({ query }) => [{ title: 'live-result', relevance: 0.99, refPid: 'liveeeeeeeeeeeee' }];
  const r = crowRapidLitReview({ query: 'x', candidatePool: [], fetchFn });
  assert.equal(r.results[0].title, 'live-result');
});

test('crowRapidLitReview rejects missing query', () => {
  assert.throws(() => crowRapidLitReview({}), TypeError);
});

test('falconDeepLitAnalysis produces depth insights per ref', () => {
  const topRefs = [{ title: 'r1', refPid: 'aaaa111122223333' }, { title: 'r2', refPid: 'bbbb111122223333' }];
  const r = falconDeepLitAnalysis({ topRefs, depth: 3 });
  assert.equal(r.expansions.length, 2);
  for (const e of r.expansions) {
    assert.equal(e.insights.length, 3);
    for (const i of e.insights) {
      assert.match(i.insightPid, /^[a-f0-9]{16}$/);
      assert.ok(i.confidence >= 0 && i.confidence <= 1);
    }
  }
});

test('falconDeepLitAnalysis insights deterministic per ref+depth', () => {
  const topRefs = [{ title: 'r1', refPid: 'aaaa111122223333' }];
  const r1 = falconDeepLitAnalysis({ topRefs, depth: 2 });
  const r2 = falconDeepLitAnalysis({ topRefs, depth: 2 });
  assert.equal(r1.expansions[0].insights[0].insightPid, r2.expansions[0].insights[0].insightPid);
});

test('falconDeepLitAnalysis rejects empty topRefs', () => {
  assert.throws(() => falconDeepLitAnalysis({ topRefs: [] }), TypeError);
});

test('toCrowRow + toFalconRow HBPv1 pipe-row no JSON', () => {
  const cr = crowRapidLitReview({ query: 'x', candidatePool: [{ title: 'a' }, { title: 'b' }] });
  const fr = falconDeepLitAnalysis({ topRefs: cr.results });
  const cRow = toCrowRow(cr);
  const fRow = toFalconRow(fr);
  for (const row of [cRow, fRow]) {
    assert.match(row, /^[A-Z][A-Z0-9-]*\|/);
    assert.ok(!row.includes('{'));
    assert.ok(!row.includes('"'));
  }
});

// =================== NIH AIMS ===================
test('generateNIHAimsPage pads to exactly 3 aims', () => {
  const r1 = generateNIHAimsPage({ researchGoal: 'test', topHypotheses: [{ pid: 'a', text: 't1' }] });
  assert.match(r1.content, /Specific Aim 1/);
  assert.match(r1.content, /Specific Aim 2/);
  assert.match(r1.content, /Specific Aim 3/);
  assert.match(r1.content, /Placeholder Aim 2|Placeholder Aim 3/);
});

test('generateNIHAimsPage format=hbpv1 emits pipe-row no JSON', () => {
  const r = generateNIHAimsPage({ researchGoal: 'test', topHypotheses: [{ pid: 'a', text: 't' }], format: 'hbpv1' });
  assert.equal(r.format, 'hbpv1');
  assert.ok(!r.content.includes('{'));
  assert.match(r.content, /^NIH-AIMS-DOC\|/);
});

test('generateNIHAimsPage rejects missing researchGoal', () => {
  assert.throws(() => generateNIHAimsPage({ topHypotheses: [] }), TypeError);
});

test('generateNIHAimsPage deterministic docPid for same inputs', () => {
  const a = generateNIHAimsPage({ researchGoal: 'g', topHypotheses: [{ pid: 'p1' }, { pid: 'p2' }, { pid: 'p3' }] });
  const b = generateNIHAimsPage({ researchGoal: 'g', topHypotheses: [{ pid: 'p1' }, { pid: 'p2' }, { pid: 'p3' }] });
  assert.equal(a.docPid, b.docPid);
});

test('toNIHOverviewRow is HBPv1 pipe-row no JSON', () => {
  const r = generateNIHAimsPage({ researchGoal: 'g', topHypotheses: [] });
  const row = toNIHOverviewRow({ docPid: r.docPid, format: r.format });
  assert.match(row, /^NIH-AIMS-OVERVIEW\|/);
  assert.ok(!row.includes('{'));
});

// =================== RESEARCH CONTACTS ===================
test('identifyResearchContacts with empty refs returns note', () => {
  const r = identifyResearchContacts({ topHypotheses: [], literatureRefs: [] });
  assert.equal(r.contacts.length, 0);
  assert.match(r.note, /NO_LITERATURE_REFS/);
});

test('identifyResearchContacts dedupes same expert across refs', () => {
  const refs = [
    { title: 'r1', authors: ['Alice', 'Bob'], firstAuthor: 'Alice', affiliation: 'MIT', relevance: 0.8 },
    { title: 'r2', authors: ['Alice', 'Carol'], firstAuthor: 'Alice', affiliation: 'MIT', relevance: 0.7 },
  ];
  const r = identifyResearchContacts({ topHypotheses: [{ pid: 'h1' }], literatureRefs: refs });
  const alice = r.contacts.find(c => c.expertName === 'Alice');
  assert.ok(alice);
  assert.equal(alice.ref_count, 2);
});

test('identifyResearchContacts sorts by relevance DESC', () => {
  const refs = [
    { title: 'r1', authors: ['LowRel'], firstAuthor: 'LowRel', relevance: 0.1 },
    { title: 'r2', authors: ['HighRel'], firstAuthor: 'HighRel', relevance: 0.9 },
  ];
  const r = identifyResearchContacts({ topHypotheses: [{ pid: 'h' }], literatureRefs: refs });
  assert.ok(r.contacts[0].relevance >= r.contacts[1].relevance);
});

test('toContactRow is HBPv1 pipe-row no JSON', () => {
  const refs = [{ title: 'r', authors: ['A'], firstAuthor: 'A', relevance: 0.5 }];
  const r = identifyResearchContacts({ topHypotheses: [{ pid: 'h' }], literatureRefs: refs });
  const row = toContactRow(r.contacts[0]);
  assert.match(row, /^RESEARCH-CONTACT\|/);
  assert.ok(!row.includes('{'));
});
