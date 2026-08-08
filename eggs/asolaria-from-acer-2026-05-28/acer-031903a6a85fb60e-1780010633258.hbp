// Meta-review feedback propagation module per Google AI Co-Scientist (arxiv:2502.18864 §3.3.6).
//
// PURPOSE: closes the cross-iteration learning loop for decision-loop-core.mjs.
// Each iteration chain-seals — but currently nothing propagates accumulated learning
// into the NEXT iteration's prompts. Co-Scientist's Meta-review agent solves this:
//   - Summarize recurring patterns in reviews + tournament debates into a critique.
//   - Append that critique to ALL agents' prompts next iteration.
//   - Self-improvement WITHOUT back-propagation (no fine-tuning, no RL) — pure
//     long-context model absorption of accumulated meta-feedback.
//
// Additional spec from §3.3.6:
//   - Research overview generation (top-ranked hypotheses → roadmap; NIH Aims Page
//     supported via constrained text shape).
//   - Research contacts identification (suggest domain experts via prior literature).
//
// Canon constraints:
//   - Pure ES module, pure functions, deterministic per-input (sha16 PIDs).
//   - HBPv1 pipe-row for toMetaReviewRow (no JSON braces).
//   - Text output for NIH Aims (necessary structured-decoding shape).

import { createHash } from 'node:crypto';

function sha16(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }
function pipeRow(...p) { return p.join('|'); }

// =================== TOKEN UTILS ===================
// Frequency analysis is intentionally light-weight: tokenize on non-word boundaries,
// lowercase, strip a small stop-list. The point isn't NLP precision — it's surfacing
// terms recurring across enough reviews to count as a pattern signal.

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
  'could', 'may', 'might', 'must', 'shall', 'can', 'need', 'and', 'or',
  'but', 'if', 'then', 'else', 'for', 'of', 'to', 'in', 'on', 'at',
  'by', 'with', 'from', 'as', 'this', 'that', 'these', 'those', 'it',
  'its', 'we', 'us', 'our', 'you', 'your', 'they', 'them', 'their',
  'not', 'no', 'yes', 'so', 'too', 'very', 'just', 'than', 'also', 'about',
]);

function tokenize(s) {
  if (!s || typeof s !== 'string') return [];
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

// Group strings by frequency across a list, return [{token, count, ratio}] sorted desc.
// Only counts ONE occurrence per source-string (presence-based, not raw frequency).
function frequencyAcross(strings) {
  const counts = new Map();
  const n = strings.length;
  for (const s of strings) {
    const seen = new Set(tokenize(s));
    for (const t of seen) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const out = [];
  for (const [token, count] of counts.entries()) {
    out.push({ token, count, ratio: n > 0 ? count / n : 0 });
  }
  out.sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
  return out;
}

// =================== 1. REVIEW PATTERN SUMMARIZER ===================
// reviewArray: [{hypothesisPid, verdict, reasoning}]
//   verdict ∈ {'accept','reject','revise','strong-accept','strong-reject',...}
//   reasoning: free-text justification from the review agent.
//
// Returns up to 5 of each:
//   - recurringIssues   : terms appearing in ≥30% of negative-leaning reviews
//   - strengthSignals   : terms appearing in ≥30% of positive-leaning reviews
//   - blindSpots        : terms in reasoning across both pools but rare overall
//                         (≥30% of mixed pool, AND <50% of either positive/negative
//                         pool individually) — i.e. raised by both sides → blind spot.

const POSITIVE_VERDICTS = new Set(['accept', 'strong-accept', 'pass', 'approve']);
const NEGATIVE_VERDICTS = new Set(['reject', 'strong-reject', 'fail', 'revise', 'deny']);

const RECURRING_THRESHOLD = 0.30;
const TOP_K = 5;

export function summarizePatternsFromReviews(reviewArray) {
  if (!Array.isArray(reviewArray) || reviewArray.length === 0) {
    return { recurringIssues: [], strengthSignals: [], blindSpots: [] };
  }

  const positives = [];
  const negatives = [];
  const allReasoning = [];
  for (const r of reviewArray) {
    const reasoning = (r && typeof r === 'object' && typeof r.reasoning === 'string') ? r.reasoning : '';
    if (!reasoning) continue;
    allReasoning.push(reasoning);
    const verdict = (r.verdict || '').toString().toLowerCase().trim();
    if (POSITIVE_VERDICTS.has(verdict)) positives.push(reasoning);
    else if (NEGATIVE_VERDICTS.has(verdict)) negatives.push(reasoning);
  }

  const negFreq = frequencyAcross(negatives);
  const posFreq = frequencyAcross(positives);
  const allFreq = frequencyAcross(allReasoning);

  const recurringIssues = negFreq
    .filter(x => x.ratio >= RECURRING_THRESHOLD)
    .slice(0, TOP_K)
    .map(x => x.token);

  const strengthSignals = posFreq
    .filter(x => x.ratio >= RECURRING_THRESHOLD)
    .slice(0, TOP_K)
    .map(x => x.token);

  // Blind spots: raised across-the-board (≥30% of all) but not dominated by one camp.
  // A term hits this band when it's recurring in the mixed pool yet appears in
  // BOTH positives and negatives without dominating either (<50% of each).
  const posSet = new Map(posFreq.map(x => [x.token, x.ratio]));
  const negSet = new Map(negFreq.map(x => [x.token, x.ratio]));
  const blindSpots = allFreq
    .filter(x => {
      if (x.ratio < RECURRING_THRESHOLD) return false;
      const inPos = (posSet.get(x.token) || 0);
      const inNeg = (negSet.get(x.token) || 0);
      // Must appear in BOTH camps (cross-cutting concern)
      // AND not be dominated by either side (would otherwise be recurring/strength).
      return inPos > 0 && inNeg > 0 && inPos < 0.5 && inNeg < 0.5;
    })
    .slice(0, TOP_K)
    .map(x => x.token);

  return { recurringIssues, strengthSignals, blindSpots };
}

// =================== 2. TOURNAMENT PATTERN SUMMARIZER ===================
// matchHistory: [{matchId, winnerPid, loserPid, winReason, lossReason}]
//   winReason / lossReason: free-text rationales from the tournament debate.
//
// Returns:
//   - dominantStrategies   : tokens recurring ≥30% across win reasons (top 5).
//   - commonLossPatterns   : tokens recurring ≥30% across loss reasons (top 5).

export function summarizePatternsFromTournament(matchHistory) {
  if (!Array.isArray(matchHistory) || matchHistory.length === 0) {
    return { dominantStrategies: [], commonLossPatterns: [] };
  }

  const winReasons = [];
  const lossReasons = [];
  for (const m of matchHistory) {
    if (!m || typeof m !== 'object') continue;
    if (typeof m.winReason === 'string' && m.winReason) winReasons.push(m.winReason);
    if (typeof m.lossReason === 'string' && m.lossReason) lossReasons.push(m.lossReason);
  }

  const winFreq = frequencyAcross(winReasons);
  const lossFreq = frequencyAcross(lossReasons);

  const dominantStrategies = winFreq
    .filter(x => x.ratio >= RECURRING_THRESHOLD)
    .slice(0, TOP_K)
    .map(x => x.token);

  const commonLossPatterns = lossFreq
    .filter(x => x.ratio >= RECURRING_THRESHOLD)
    .slice(0, TOP_K)
    .map(x => x.token);

  return { dominantStrategies, commonLossPatterns };
}

// =================== 3. META-CRITIQUE COMPOSER ===================
// Generates the feedback text appended to ALL agent prompts next iteration.
// Format: clean text paragraph (≤500 chars), starts with "META-REVIEW iter=N FEEDBACK:".

const MAX_CRITIQUE_CHARS = 500;

function joinShort(label, items) {
  if (!items || items.length === 0) return '';
  return ` ${label}: ${items.join(', ')}.`;
}

export function composeMetaCritique({ reviewPatterns, tournamentPatterns, iteration }) {
  const iter = Number.isFinite(iteration) ? iteration : 0;
  const rp = reviewPatterns || {};
  const tp = tournamentPatterns || {};

  const recurring = Array.isArray(rp.recurringIssues) ? rp.recurringIssues : [];
  const strengths = Array.isArray(rp.strengthSignals) ? rp.strengthSignals : [];
  const blind = Array.isArray(rp.blindSpots) ? rp.blindSpots : [];
  const wins = Array.isArray(tp.dominantStrategies) ? tp.dominantStrategies : [];
  const losses = Array.isArray(tp.commonLossPatterns) ? tp.commonLossPatterns : [];

  let text = `META-REVIEW iter=${iter} FEEDBACK:`;
  text += joinShort('recurring issues', recurring);
  text += joinShort('strengths to preserve', strengths);
  text += joinShort('blind spots', blind);
  text += joinShort('dominant winning strategies', wins);
  text += joinShort('common loss patterns', losses);

  if (recurring.length === 0 && strengths.length === 0 && blind.length === 0
      && wins.length === 0 && losses.length === 0) {
    text += ' no recurring patterns detected; explore broader hypothesis space.';
  }

  // Hard cap at MAX_CRITIQUE_CHARS — truncate on word boundary, append ellipsis sentinel.
  if (text.length > MAX_CRITIQUE_CHARS) {
    const trunc = text.slice(0, MAX_CRITIQUE_CHARS - 1);
    const lastSpace = trunc.lastIndexOf(' ');
    text = (lastSpace > MAX_CRITIQUE_CHARS - 80 ? trunc.slice(0, lastSpace) : trunc) + '…';
  }
  return text;
}

// =================== 4. RESEARCH OVERVIEW ===================
// topHypotheses: [{pid, title, summary, eloScore?}]
// format: 'hbpv1' (default) → pipe-row list; 'nih-aims' → structured text.

function clampLine(s, max = 200) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function generateHbpv1Overview(topHypotheses, researchGoal) {
  const rows = [];
  rows.push(pipeRow(
    'RESEARCH-OVERVIEW',
    `goal_sha16=${sha16(researchGoal || '')}`,
    `hypothesis_count=${topHypotheses.length}`,
    `goal_len=${(researchGoal || '').length}`,
  ));
  for (let i = 0; i < topHypotheses.length; i++) {
    const h = topHypotheses[i] || {};
    rows.push(pipeRow(
      'HYP-RANK',
      `rank=${i + 1}`,
      `pid=${h.pid || sha16(`hyp|${i}|${h.title || ''}`)}`,
      `title_sha16=${sha16(h.title || '')}`,
      `elo=${Number.isFinite(h.eloScore) ? h.eloScore : 'NA'}`,
      `title=${clampLine(h.title, 120)}`,
    ));
  }
  return rows.join('\n');
}

function generateNihAimsOverview(topHypotheses, researchGoal) {
  // NIH Specific Aims Page convention: brief paragraph framing, then numbered aims.
  // Cap at exactly 3 aims (NIH norm); cite the top 3 hypotheses, padding if fewer.
  const goal = clampLine(researchGoal || 'Unspecified research goal', 400);
  const aims = [];
  for (let i = 0; i < 3; i++) {
    const h = topHypotheses[i] || { title: '(no candidate hypothesis at this rank)', summary: '' };
    const title = clampLine(h.title || `Aim ${i + 1} placeholder`, 180);
    const summary = clampLine(h.summary || title, 280);
    aims.push(
      `Specific Aim ${i + 1}: ${title}\n` +
      `Rationale: ${summary}\n` +
      `Hypothesis PID: ${h.pid || 'PENDING'}`
    );
  }
  return [
    'Research Overview — NIH Specific Aims Page',
    '',
    `Research Goal: ${goal}`,
    '',
    'The following Specific Aims are derived from the top-ranked hypotheses produced',
    'by the Co-Scientist tournament + review pipeline. Each aim cites one candidate',
    'hypothesis for downstream wet-lab or in-silico validation.',
    '',
    ...aims,
  ].join('\n');
}

export function generateResearchOverview({ topHypotheses, researchGoal, format = 'hbpv1' }) {
  const hyps = Array.isArray(topHypotheses) ? topHypotheses : [];
  if (format === 'nih-aims') return generateNihAimsOverview(hyps, researchGoal);
  // Default 'hbpv1'
  return generateHbpv1Overview(hyps, researchGoal);
}

// =================== 5. RESEARCH CONTACTS ===================
// literatureRefs: [{title?, authors?: [{name, affiliation?}], doi?, year?}]
// Returns [{expertName, affiliation, rationale}] suggested contacts.
// When literatureRefs missing/empty, returns single sentinel record per spec.

export function identifyResearchContacts({ topHypotheses, literatureRefs }) {
  const refs = Array.isArray(literatureRefs) ? literatureRefs : [];
  if (refs.length === 0) {
    return [{
      expertName: null,
      affiliation: null,
      rationale: null,
      note: 'NO_LITERATURE_REFS_PROVIDED',
    }];
  }

  // Aggregate authors across refs; rank by number of refs they appear in (prolific authors first).
  const authorMap = new Map(); // key: name|affiliation → {name, affiliation, refCount, titles}
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object') continue;
    const authors = Array.isArray(ref.authors) ? ref.authors : [];
    for (const a of authors) {
      if (!a || typeof a !== 'object' || typeof a.name !== 'string' || !a.name.trim()) continue;
      const name = a.name.trim();
      const affiliation = typeof a.affiliation === 'string' && a.affiliation.trim()
        ? a.affiliation.trim()
        : 'Affiliation not provided';
      const key = `${name}|${affiliation}`;
      const existing = authorMap.get(key);
      if (existing) {
        existing.refCount += 1;
        if (ref.title) existing.titles.push(ref.title);
      } else {
        authorMap.set(key, {
          name,
          affiliation,
          refCount: 1,
          titles: ref.title ? [ref.title] : [],
        });
      }
    }
  }

  const hypotheses = Array.isArray(topHypotheses) ? topHypotheses : [];
  const hypTitlesJoin = clampLine(hypotheses.map(h => (h && h.title) || '').filter(Boolean).join('; '), 140);

  const contacts = [];
  for (const entry of authorMap.values()) {
    const sample = entry.titles[0] ? `prior work: "${clampLine(entry.titles[0], 100)}"` : 'prior literature relevance';
    const rationale = hypTitlesJoin
      ? `${sample}; pertinent to top hypotheses (${hypTitlesJoin})`
      : sample;
    contacts.push({
      expertName: entry.name,
      affiliation: entry.affiliation,
      rationale: clampLine(rationale, 280),
    });
  }

  // Sort: most prolific (cross-cutting) first; ties broken by name.
  contacts.sort((a, b) => {
    const ra = authorMap.get(`${a.expertName}|${a.affiliation}`).refCount;
    const rb = authorMap.get(`${b.expertName}|${b.affiliation}`).refCount;
    return rb - ra || a.expertName.localeCompare(b.expertName);
  });

  return contacts;
}

// =================== 6. HBPv1 PIPE-ROW EMITTER ===================
// Sha16 over the critique text + iteration → stable PID for chain-seal.

export function toMetaReviewRow(critique, iteration) {
  const iter = Number.isFinite(iteration) ? iteration : 0;
  const text = String(critique ?? '');
  const sha = sha16(`meta-review|iter=${iter}|${text}`);

  // Count back recurring/strengths/blindspots from the critique text shape
  // (cheap parse — labels are deterministic). Fall back to 0 if absent.
  const countItems = (label) => {
    const m = text.match(new RegExp(`${label}: ([^.]+)\\.`));
    if (!m) return 0;
    return m[1].split(',').map(s => s.trim()).filter(Boolean).length;
  };
  const recurring = countItems('recurring issues');
  const strengths = countItems('strengths to preserve');
  const blindspots = countItems('blind spots');

  return pipeRow(
    'META-REVIEW',
    `iter=${iter}`,
    `sha16=${sha}`,
    `recurring=${recurring}`,
    `strengths=${strengths}`,
    `blindspots=${blindspots}`,
  );
}
