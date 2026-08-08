// Web Search Agent — Crow (rapid) + Falcon (deep) per Robin Nature 2026.
// Per operator 2026-05-29 closing 13-gap inventory item 1 of 3.
// DETERMINISTIC offline implementation (no real web call in pure mode). Live LLM/web judge can swap via fetchFn override.

import { createHash } from 'node:crypto';

function sha16(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }
function pipeRow(...p) { return p.join('|'); }

// Crow = rapid literature review (top-K snippets, fast filter)
export function crowRapidLitReview({ query, candidatePool = [], topK = 5, fetchFn }) {
  if (!query || typeof query !== 'string') throw new TypeError('crowRapidLitReview: query required');
  if (fetchFn) {
    const results = fetchFn({ query, mode: 'rapid', topK });
    return { mode: 'rapid', query, queryPid: sha16(`crow|${query}`), results };
  }
  // Deterministic stand-in: hash query against candidate pool
  const queryDigest = createHash('sha256').update(query).digest();
  const scored = candidatePool.map(c => {
    const cDigest = createHash('sha256').update(c.title + (c.abstract || '')).digest();
    let dist = 0;
    for (let i = 0; i < 16; i++) dist += (queryDigest[i] ^ cDigest[i]);
    return { ...c, relevance: 1 - dist / (16 * 255), refPid: sha16(`ref|${c.title}`) };
  });
  scored.sort((a, b) => b.relevance - a.relevance);
  return { mode: 'rapid', query, queryPid: sha16(`crow|${query}`), results: scored.slice(0, topK) };
}

// Falcon = deep literature analysis (per-ref expansion + reasoning chains)
export function falconDeepLitAnalysis({ topRefs, depth = 3, fetchFn }) {
  if (!Array.isArray(topRefs) || topRefs.length === 0) throw new TypeError('falconDeepLitAnalysis: topRefs required');
  if (fetchFn) {
    const expansions = fetchFn({ topRefs, mode: 'deep', depth });
    return { mode: 'deep', depth, expansions };
  }
  // Deterministic stand-in: per ref produce depth-many derived insights
  const expansions = topRefs.map(ref => {
    const insights = [];
    for (let d = 0; d < depth; d++) {
      const insightPid = sha16(`falcon|${ref.refPid || ref.title}|d${d}`);
      insights.push({
        depth: d,
        insightPid,
        derived_from: ref.refPid || sha16(`ref|${ref.title}`),
        text_sha16: sha16(`${ref.title}|insight|${d}`),
        confidence: 1 - d * 0.2,
      });
    }
    return { ref: ref.title, refPid: ref.refPid, insights };
  });
  return { mode: 'deep', depth, expansions };
}

export function toCrowRow(result) {
  return pipeRow('CROW-LIT-REVIEW', `query_pid=${result.queryPid}`, `mode=${result.mode}`, `results_count=${result.results.length}`, `top_relevance=${result.results[0]?.relevance.toFixed(4) || '0'}`);
}
export function toFalconRow(result) {
  const total = result.expansions.reduce((s, e) => s + e.insights.length, 0);
  return pipeRow('FALCON-DEEP-ANALYSIS', `mode=${result.mode}`, `depth=${result.depth}`, `refs=${result.expansions.length}`, `total_insights=${total}`);
}
