// Evolution agent — six refinement approaches per Google AI Co-Scientist (§3.3.5).
// Spec: arxiv:2502.18864 §3.3.5
//
// CRITICAL CANON (§3.3.5 verbatim):
//   "The Evolution agent generates new hypotheses; it doesn't modify or replace
//    existing ones. This strategy protects the quality of top-ranked hypotheses
//    from flawed improvements, as each new hypothesis must also compete in the
//    tournament."
//
// Therefore every approach in this module:
//   - Takes a parent hypothesis (or an array, for combination).
//   - Returns a brand-new hypothesis object with a fresh PID.
//   - NEVER mutates the parent(s). Parents are read-only inputs.
//
// Six approaches (§3.3.5):
//   1. Enhancement through grounding
//   2. Coherence / practicality / feasibility improvements
//   3. Inspiration from existing top-ranked hypotheses
//   4. Combination of multiple top-ranked hypotheses
//   5. Simplification (easier to verify)
//   6. Out-of-box thinking (divergent, unconventional)

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha16(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// Fresh PID per spec: sha16(method + parent.pid + text + Date.now() + Math.random()).
// The Date.now() + Math.random() pair guarantees uniqueness across calls even
// when method/parent/text are identical (e.g. two back-to-back simplifications).
function mintEvolutionPid(method, parentPidJoined, text) {
  const salt = `${Date.now()}|${Math.random()}`;
  return sha16(`${method}|${parentPidJoined}|${text}|${salt}`);
}

function requireHypothesis(name, h) {
  if (h == null || typeof h !== 'object') {
    throw new TypeError(`${name}: parent must be a hypothesis object (got ${h === null ? 'null' : typeof h})`);
  }
  if (typeof h.pid !== 'string' || h.pid.length === 0) {
    throw new TypeError(`${name}: parent.pid must be a non-empty string`);
  }
  if (typeof h.text !== 'string') {
    throw new TypeError(`${name}: parent.text must be a string`);
  }
}

function buildNew(method, parentPidJoined, text) {
  return {
    pid: mintEvolutionPid(method, parentPidJoined, text),
    text,
    derivedFrom: parentPidJoined,
    derivationMethod: method,
  };
}

// ---------------------------------------------------------------------------
// 1. Enhancement through grounding
// ---------------------------------------------------------------------------

export function enhanceByGrounding(parent, { weaknessAnnotation } = {}) {
  requireHypothesis('enhanceByGrounding', parent);
  if (typeof weaknessAnnotation !== 'string' || weaknessAnnotation.length === 0) {
    throw new TypeError('enhanceByGrounding: weaknessAnnotation must be a non-empty string');
  }
  const text = `${parent.text} + GROUNDED: ${weaknessAnnotation}`;
  return buildNew('enhance-grounding', parent.pid, text);
}

// ---------------------------------------------------------------------------
// 2. Coherence / practicality / feasibility improvements
// ---------------------------------------------------------------------------

export function improveCoherence(parent) {
  requireHypothesis('improveCoherence', parent);
  const text = `COHERENT-VARIANT(${parent.text})`;
  return buildNew('coherence', parent.pid, text);
}

// ---------------------------------------------------------------------------
// 3. Inspiration from existing top-ranked hypotheses
// ---------------------------------------------------------------------------

export function inspireFromTopRanked(parent) {
  requireHypothesis('inspireFromTopRanked', parent);
  const text = `INSPIRED-BY(${parent.text})`;
  return buildNew('inspired', parent.pid, text);
}

// ---------------------------------------------------------------------------
// 4. Combination of multiple top-ranked hypotheses
// ---------------------------------------------------------------------------

export function combineHypotheses(parents) {
  if (!Array.isArray(parents) || parents.length < 2) {
    throw new TypeError('combineHypotheses: parents must be an array of >=2 hypotheses');
  }
  for (const p of parents) requireHypothesis('combineHypotheses', p);

  const parentPids = parents.map((p) => p.pid).join(',');
  const text = `COMBINED(${parents.map((p) => p.text).join(' + ')})`;
  return buildNew('combination', parentPids, text);
}

// ---------------------------------------------------------------------------
// 5. Simplification
// ---------------------------------------------------------------------------

export function simplifyHypothesis(parent) {
  requireHypothesis('simplifyHypothesis', parent);
  const text = `SIMPLE(${parent.text.slice(0, 50)})`;
  return buildNew('simplification', parent.pid, text);
}

// ---------------------------------------------------------------------------
// 6. Out-of-box thinking
// ---------------------------------------------------------------------------

export function outOfBoxThinking(parent, { divergenceSeed } = {}) {
  requireHypothesis('outOfBoxThinking', parent);
  if (divergenceSeed === undefined || divergenceSeed === null) {
    throw new TypeError('outOfBoxThinking: divergenceSeed is required');
  }
  const text = `DIVERGENT(${parent.text}, seed=${divergenceSeed})`;
  return buildNew('out-of-box', parent.pid, text);
}

// ---------------------------------------------------------------------------
// Batch driver — run all six approaches in one call
// ---------------------------------------------------------------------------

export function runAllEvolutionApproaches({ parent, topRanked, weakness = 'generic' } = {}) {
  requireHypothesis('runAllEvolutionApproaches', parent);
  if (!Array.isArray(topRanked) || topRanked.length < 2) {
    throw new TypeError(
      'runAllEvolutionApproaches: topRanked must be an array of >=2 hypotheses (used for combination)'
    );
  }
  for (const p of topRanked) requireHypothesis('runAllEvolutionApproaches', p);

  // Divergence seed: deterministic-looking but unique per call (so two
  // back-to-back invocations don't yield identical out-of-box text).
  const divergenceSeed = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return [
    enhanceByGrounding(parent, { weaknessAnnotation: weakness }),
    improveCoherence(parent),
    inspireFromTopRanked(parent),
    combineHypotheses(topRanked),
    simplifyHypothesis(parent),
    outOfBoxThinking(parent, { divergenceSeed }),
  ];
}

// ---------------------------------------------------------------------------
// HBPv1 pipe-row serializer
// ---------------------------------------------------------------------------

export function toEvolutionRow(hypothesis) {
  if (hypothesis == null || typeof hypothesis !== 'object') {
    throw new TypeError('toEvolutionRow: hypothesis must be an object');
  }
  const { pid, derivationMethod, derivedFrom, text } = hypothesis;
  if (typeof pid !== 'string' || pid.length === 0) {
    throw new TypeError('toEvolutionRow: hypothesis.pid required');
  }
  if (typeof derivationMethod !== 'string' || derivationMethod.length === 0) {
    throw new TypeError('toEvolutionRow: hypothesis.derivationMethod required');
  }
  if (typeof derivedFrom !== 'string') {
    throw new TypeError('toEvolutionRow: hypothesis.derivedFrom required');
  }
  if (typeof text !== 'string') {
    throw new TypeError('toEvolutionRow: hypothesis.text required');
  }
  const textSha = sha16(text);
  return `EVOLVED|pid=${pid}|method=${derivationMethod}|parent=${derivedFrom}|text_sha16=${textSha}`;
}

// ---------------------------------------------------------------------------
// Exposed helpers (handy for callers that want to hash their own inputs)
// ---------------------------------------------------------------------------

export { sha16 };
