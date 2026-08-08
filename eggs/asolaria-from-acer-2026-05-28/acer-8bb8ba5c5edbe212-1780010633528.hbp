// Reflection — 5 review types implementing Google AI Co-Scientist §3.3.2
//   (arxiv:2502.18864 Reflection agent).
//
// Extends the existing PROF-X-DOUBLE-CRITIC-PAIR (which covers the
// initial-pass critic role) with the 4 review modes the paper specifies
// beyond the entry critic:
//   1. initialReview            — fast filter (length / banned-terms / sha)
//   2. fullReview               — novelty + correctness + quality grounded
//                                 against a literature-ref pool
//   3. deepVerificationReview   — assumption decomposition; fundamental vs
//                                 non-fundamental error classification
//   4. observationReview        — long-tail observation coverage check
//   5. simulationReview         — step-wise mechanism simulation; first
//                                 failed step short-circuits to "fails"
//
// Pure / deterministic. No real LLM, no web fetch. Each verdict is derived
// from hypothesis.text + sha16(hypothesis) so the same inputs always
// produce the same review output. A live judge can later be swapped in by
// passing a `verdictFn` override (parallel to elo-tournament's compareFn
// override pattern).
//
// Hypothesis shape: { pid: <16-hex string>, text: <string> }
// All emitter rows are HBPv1 pipe-rows: no JSON braces in row text.

import { createHash } from 'node:crypto';

// =================== CONSTANTS ===================

const MIN_HYPOTHESIS_LEN = 20;
const OBSERVATION_PASS_THRESHOLD = 0.7;
const NOVELTY_SUBSTRING_MIN_LEN = 12; // shorter than this is treated as
                                      // too-generic and skipped for the
                                      // literature substring scan
const BANNED_TERMS = Object.freeze([
  'mind-reading',
  'literal telepathy',
]);

export const REVIEW_TYPES = Object.freeze({
  INITIAL: 'initial',
  FULL: 'full',
  DEEP_VERIFY: 'deep-verify',
  OBSERVATION: 'observation',
  SIMULATION: 'simulation',
});

// =================== HELPERS ===================

function sha256Hex(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

function sha16(s) {
  return sha256Hex(s).slice(0, 16);
}

function shaByteAt(hex, idx) {
  // Read one byte (two hex chars) from a hex digest at the given byte index.
  // Returns 0..255. Wraps modulo hex.length / 2.
  const len = Math.floor(hex.length / 2);
  const i = ((idx % len) + len) % len;
  const hi = parseInt(hex.charAt(i * 2), 16);
  const lo = parseInt(hex.charAt(i * 2 + 1), 16);
  return (hi << 4) | lo;
}

function assertHypothesis(h) {
  if (!h || typeof h !== 'object') {
    throw new TypeError('hypothesis: object required');
  }
  if (typeof h.pid !== 'string' || h.pid.length === 0) {
    throw new TypeError('hypothesis: pid must be non-empty string');
  }
  if (typeof h.text !== 'string') {
    throw new TypeError('hypothesis: text must be a string');
  }
}

function hypothesisSha16(h) {
  // PID may be a federation-issued handle; we still hash the text so review
  // verdicts are anchored to the content, not the label.
  return sha16(`hypothesis|${h.pid}|${h.text}`);
}

// =================== 1. INITIAL REVIEW ===================
// "Quick filter, no external tools, assesses correctness/quality/novelty/
//  safety preliminarily." (§3.3.2)
// Reject if:
//   - text length < MIN_HYPOTHESIS_LEN, or
//   - any banned term appears in the text (case-insensitive).

export function initialReview(hypothesis) {
  assertHypothesis(hypothesis);
  const text = hypothesis.text;
  const reasons = [];
  const lowered = text.toLowerCase();
  const tooShort = text.length < MIN_HYPOTHESIS_LEN;
  if (tooShort) {
    reasons.push(`too_short:len=${text.length}:min=${MIN_HYPOTHESIS_LEN}`);
  }
  const hits = [];
  for (const term of BANNED_TERMS) {
    if (lowered.includes(term.toLowerCase())) hits.push(term);
  }
  if (hits.length > 0) {
    reasons.push(`banned_terms:${hits.join(',')}`);
  }
  const passes = !tooShort && hits.length === 0;
  return {
    type: REVIEW_TYPES.INITIAL,
    pid: hypothesis.pid,
    sha16: hypothesisSha16(hypothesis),
    passes,
    verdict: passes ? 'PASS_INITIAL' : 'REJECT_INITIAL',
    reasons,
  };
}

// =================== 2. FULL REVIEW ===================
// "With web search + literature; novelty/correctness/quality with full
//  literature grounding."  (§3.3.2)
//
// Deterministic stand-in for the LLM/web-grounded judge:
//   novelty     — 1 - (literatureRefs that contain hypothesis substring /
//                       literatureRefs.length).  If no refs supplied,
//                       novelty defaults to 1.0 (untested ground).
//   correctness — derived from sha16 byte 0 mapped to [0,1].
//   quality     — length proxy on tanh(len / 200) so a 200-char hypothesis
//                       sits around 0.76 and longer texts saturate near 1.
//   passes      — all three >= 0.5 AND initialReview passes.

export function fullReview(hypothesis, { literatureRefs = [] } = {}) {
  assertHypothesis(hypothesis);
  if (!Array.isArray(literatureRefs)) {
    throw new TypeError('fullReview: literatureRefs must be an array');
  }
  const initial = initialReview(hypothesis);
  const digest = hypothesisSha16(hypothesis);
  const reasons = [];

  // ---- Novelty: count refs that contain a substring of the hypothesis.
  // To avoid spurious matches on tiny words, take the longest run of >=
  // NOVELTY_SUBSTRING_MIN_LEN-length tokens from the hypothesis.
  const text = hypothesis.text;
  const probes = [];
  if (text.length >= NOVELTY_SUBSTRING_MIN_LEN) {
    // Sliding window of NOVELTY_SUBSTRING_MIN_LEN characters; sample up to 8
    // probes evenly spaced.  This keeps cost O(text.length) and gives the
    // novelty heuristic something to bite on.
    const step = Math.max(1, Math.floor((text.length - NOVELTY_SUBSTRING_MIN_LEN) / 8) || 1);
    for (let i = 0; i + NOVELTY_SUBSTRING_MIN_LEN <= text.length && probes.length < 8; i += step) {
      probes.push(text.slice(i, i + NOVELTY_SUBSTRING_MIN_LEN));
    }
    if (probes.length === 0) probes.push(text);
  } else {
    probes.push(text);
  }
  let hitCount = 0;
  if (literatureRefs.length > 0) {
    for (const ref of literatureRefs) {
      const refText = String(ref ?? '');
      let matched = false;
      for (const p of probes) {
        if (refText.includes(p)) { matched = true; break; }
      }
      if (matched) hitCount++;
    }
  }
  const novelty = literatureRefs.length === 0
    ? 1.0
    : 1 - (hitCount / literatureRefs.length);
  reasons.push(`novelty:hits=${hitCount}/${literatureRefs.length}:score=${novelty.toFixed(4)}`);

  // ---- Correctness: sha-derived deterministic [0,1].
  const correctness = shaByteAt(digest, 0) / 255;
  reasons.push(`correctness:sha_byte0=${shaByteAt(digest, 0)}:score=${correctness.toFixed(4)}`);

  // ---- Quality: length proxy via tanh.
  const quality = Math.tanh(text.length / 200);
  reasons.push(`quality:text_len=${text.length}:score=${quality.toFixed(4)}`);

  const passes = initial.passes
    && novelty >= 0.5
    && correctness >= 0.5
    && quality >= 0.5;
  if (!initial.passes) reasons.push('blocked_by_initial');

  return {
    type: REVIEW_TYPES.FULL,
    pid: hypothesis.pid,
    sha16: digest,
    passes,
    verdict: passes ? 'PASS_FULL' : 'REJECT_FULL',
    novelty: Number(novelty.toFixed(6)),
    correctness: Number(correctness.toFixed(6)),
    quality: Number(quality.toFixed(6)),
    literatureRefsCount: literatureRefs.length,
    reasons,
  };
}

// =================== 3. DEEP VERIFICATION REVIEW ===================
// "Decomposes hypothesis into constituent assumptions → sub-assumptions,
//  evaluates each independently.  Not-fundamental errors handled in
//  refinement; fundamental errors invalidate."  (§3.3.2)
//
// Assumption input shape:
//   { text: string, fundamental: bool (optional, defaults derived from sha) }
// Validity is sha-derived from (hypothesis.sha16 | assumption.text | idx).

export function deepVerificationReview(hypothesis, { assumptions = [] } = {}) {
  assertHypothesis(hypothesis);
  if (!Array.isArray(assumptions)) {
    throw new TypeError('deepVerificationReview: assumptions must be an array');
  }
  const digest = hypothesisSha16(hypothesis);
  const perAssumption = assumptions.map((a, idx) => {
    if (!a || typeof a !== 'object') {
      throw new TypeError(`deepVerificationReview: assumptions[${idx}] must be an object`);
    }
    if (typeof a.text !== 'string') {
      throw new TypeError(`deepVerificationReview: assumptions[${idx}].text must be a string`);
    }
    const key = sha256Hex(`assumption|${digest}|${a.text}|${idx}`);
    // Validity bit = MSB of first byte.  Deterministic across runs.
    const validBit = (shaByteAt(key, 0) & 0x80) >>> 7;
    const valid = validBit === 1;
    // Fundamental classification: caller may supply explicit boolean
    // (audit-trace transparency), otherwise we derive it from the next byte.
    const fundamentalSupplied = typeof a.fundamental === 'boolean';
    const fundamentalToHypothesis = fundamentalSupplied
      ? a.fundamental
      : (shaByteAt(key, 1) & 0x80) >>> 7 === 1;
    return {
      idx,
      assumption: a.text,
      valid,
      fundamentalToHypothesis,
      fundamentalSource: fundamentalSupplied ? 'caller' : 'sha-derived',
      evaluation: valid
        ? 'VALID'
        : fundamentalToHypothesis
          ? 'INVALID_FUNDAMENTAL'
          : 'INVALID_NON_FUNDAMENTAL',
    };
  });

  const fundamentalErrors = perAssumption.filter((p) => !p.valid && p.fundamentalToHypothesis);
  const nonFundamentalErrors = perAssumption.filter((p) => !p.valid && !p.fundamentalToHypothesis);
  const passes = fundamentalErrors.length === 0;

  return {
    type: REVIEW_TYPES.DEEP_VERIFY,
    pid: hypothesis.pid,
    sha16: digest,
    passes,
    verdict: passes
      ? (nonFundamentalErrors.length > 0 ? 'PASS_REFINE' : 'PASS_DEEP')
      : 'REJECT_DEEP_FUNDAMENTAL',
    perAssumption,
    fundamentalErrors,
    nonFundamentalErrors,
    assumptionCount: perAssumption.length,
  };
}

// =================== 4. OBSERVATION REVIEW ===================
// "Assesses whether hypothesis can account for long-tail observations
//  from prior experimental results."  (§3.3.2)
//
// Observation input shape:
//   { text: string, accountedFor?: bool (caller-supplied authority) }
// If accountedFor not supplied, derived deterministically from sha.
// Passes when fraction-accounted >= OBSERVATION_PASS_THRESHOLD (0.7).

export function observationReview(hypothesis, { observations = [] } = {}) {
  assertHypothesis(hypothesis);
  if (!Array.isArray(observations)) {
    throw new TypeError('observationReview: observations must be an array');
  }
  const digest = hypothesisSha16(hypothesis);
  const perObservation = observations.map((o, idx) => {
    if (!o || typeof o !== 'object') {
      throw new TypeError(`observationReview: observations[${idx}] must be an object`);
    }
    if (typeof o.text !== 'string') {
      throw new TypeError(`observationReview: observations[${idx}].text must be a string`);
    }
    const supplied = typeof o.accountedFor === 'boolean';
    let accountedFor;
    if (supplied) {
      accountedFor = o.accountedFor;
    } else {
      const key = sha256Hex(`observation|${digest}|${o.text}|${idx}`);
      accountedFor = (shaByteAt(key, 0) & 0x80) >>> 7 === 1;
    }
    return {
      idx,
      observation: o.text,
      accountedFor,
      source: supplied ? 'caller' : 'sha-derived',
    };
  });

  const accountedCount = perObservation.filter((p) => p.accountedFor).length;
  const fraction = perObservation.length === 0
    ? 0
    : accountedCount / perObservation.length;
  // Empty observations list = vacuously fails (the review has nothing to
  // anchor against, so we don't claim the hypothesis covers long-tail
  // experimental data).  This mirrors the paper's intent: observation-review
  // requires actual long-tail evidence to be meaningful.
  const passes = perObservation.length > 0 && fraction >= OBSERVATION_PASS_THRESHOLD;

  return {
    type: REVIEW_TYPES.OBSERVATION,
    pid: hypothesis.pid,
    sha16: digest,
    passes,
    verdict: passes ? 'PASS_OBSERVATION' : 'REJECT_OBSERVATION',
    perObservation,
    accountedCount,
    fractionAccounted: Number(fraction.toFixed(6)),
    threshold: OBSERVATION_PASS_THRESHOLD,
    observationCount: perObservation.length,
  };
}

// =================== 5. SIMULATION REVIEW ===================
// "Simulates hypothesis step-wise (mechanism or experiment) to identify
//  potential failure scenarios."  (§3.3.2)
//
// Step input shape:
//   { name: string, expectedOutcome?: string, mustSucceed?: bool }
// Per-step success is sha-derived from (hypothesis.sha16 | step | idx).
// Passes only when every step succeeds.  First failure carries a
// failureScenario string (deterministic message tied to the failing key).

export function simulationReview(hypothesis, { steps = [] } = {}) {
  assertHypothesis(hypothesis);
  if (!Array.isArray(steps)) {
    throw new TypeError('simulationReview: steps must be an array');
  }
  const digest = hypothesisSha16(hypothesis);
  const perStep = steps.map((s, idx) => {
    if (!s || typeof s !== 'object') {
      throw new TypeError(`simulationReview: steps[${idx}] must be an object`);
    }
    const name = typeof s.name === 'string' ? s.name : `step_${idx}`;
    const key = sha256Hex(`simulation|${digest}|${name}|${idx}`);
    // High threshold: only top ~12.5% of sha bytes flag failure, so most
    // well-formed simulations pass and failure stays informative.
    // Caller can force a step to be required via mustSucceed (default true).
    const successBit = shaByteAt(key, 0) < 224 ? 1 : 0; // ~87.5% pass rate
    const succeeded = successBit === 1;
    return {
      idx,
      step: name,
      expectedOutcome: typeof s.expectedOutcome === 'string' ? s.expectedOutcome : null,
      succeeded,
      failureScenario: succeeded
        ? null
        : `failure_at_step=${name}|sha_byte0=${shaByteAt(key, 0)}|key_sha16=${key.slice(0, 16)}`,
    };
  });
  const failedSteps = perStep.filter((p) => !p.succeeded);
  const passes = perStep.length > 0 && failedSteps.length === 0;

  return {
    type: REVIEW_TYPES.SIMULATION,
    pid: hypothesis.pid,
    sha16: digest,
    passes,
    verdict: passes ? 'PASS_SIMULATION' : 'REJECT_SIMULATION',
    perStep,
    failedStepCount: failedSteps.length,
    stepCount: perStep.length,
  };
}

// =================== AGGREGATE RUNNER ===================
// Runs all 5 review types in fixed canonical order, returns array of 5.
// Order matches §3.3.2 enumeration: initial → full → deep-verify →
// observation → simulation.

export function runAllReviewTypes(hypothesis, {
  literatureRefs = [],
  assumptions = [],
  observations = [],
  steps = [],
} = {}) {
  assertHypothesis(hypothesis);
  return [
    initialReview(hypothesis),
    fullReview(hypothesis, { literatureRefs }),
    deepVerificationReview(hypothesis, { assumptions }),
    observationReview(hypothesis, { observations }),
    simulationReview(hypothesis, { steps }),
  ];
}

// =================== HBPv1 PIPE-ROW EMITTER ===================
// REVIEW|type=<t>|pid=<pid>|passes=<bool>|verdict=<v>|reasons_count=<n>
// No JSON braces.  Type-specific summary tokens appended after the base
// fields so downstream readers can pick up extra context without
// re-parsing the full verdict object.

export function toReviewRow(review) {
  if (!review || typeof review !== 'object') {
    throw new TypeError('toReviewRow: review object required');
  }
  if (typeof review.type !== 'string') {
    throw new TypeError('toReviewRow: review.type must be a string');
  }
  const parts = [
    'REVIEW',
    `type=${review.type}`,
    `pid=${review.pid ?? ''}`,
    `passes=${review.passes ? 'true' : 'false'}`,
    `verdict=${review.verdict ?? ''}`,
  ];
  const reasonsCount = Array.isArray(review.reasons) ? review.reasons.length : 0;
  parts.push(`reasons_count=${reasonsCount}`);

  switch (review.type) {
    case REVIEW_TYPES.FULL:
      parts.push(`novelty=${review.novelty}`);
      parts.push(`correctness=${review.correctness}`);
      parts.push(`quality=${review.quality}`);
      parts.push(`lit_refs=${review.literatureRefsCount}`);
      break;
    case REVIEW_TYPES.DEEP_VERIFY:
      parts.push(`assumption_count=${review.assumptionCount}`);
      parts.push(`fundamental_errors=${review.fundamentalErrors.length}`);
      parts.push(`non_fundamental_errors=${review.nonFundamentalErrors.length}`);
      break;
    case REVIEW_TYPES.OBSERVATION:
      parts.push(`observation_count=${review.observationCount}`);
      parts.push(`accounted=${review.accountedCount}`);
      parts.push(`fraction=${review.fractionAccounted}`);
      parts.push(`threshold=${review.threshold}`);
      break;
    case REVIEW_TYPES.SIMULATION:
      parts.push(`step_count=${review.stepCount}`);
      parts.push(`failed_steps=${review.failedStepCount}`);
      break;
    default:
      break;
  }
  const row = parts.join('|');
  // Defensive: HBPv1 rows are pipe-delimited and MUST NOT contain JSON.
  if (row.includes('{') || row.includes('}')) {
    throw new Error('toReviewRow: row contains JSON braces (canon violation)');
  }
  return row;
}

// =================== INTERNALS (exposed for tests + tuning) ===================

export const _internals = Object.freeze({
  MIN_HYPOTHESIS_LEN,
  OBSERVATION_PASS_THRESHOLD,
  NOVELTY_SUBSTRING_MIN_LEN,
  BANNED_TERMS,
  sha16,
  sha256Hex,
  shaByteAt,
  hypothesisSha16,
});
