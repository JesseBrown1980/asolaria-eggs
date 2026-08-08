// Proximity graph for hypothesis-similarity (Co-Scientist §3.3.4).
//
// Builds a similarity graph over research hypotheses using sha16 PIDs as
// compact embedding proxies (Hamming distance over the 64-bit space).
// Does NOT generate hypotheses. Feeds the Ranking agent's tournament
// matchmaker (§3.3.3) with "similar-first" pair priority and supports
// clustering, de-duplication, and landscape exploration.
//
// Spec: arxiv:2502.18864 §3.3.4 Proximity agent
// Canon: project_bigpickle_rebuild_v0_1_0_released_2026_05_24
//
// Pure functions, no I/O, no network. ES module.
// HBPv1 pipe-row outputs only (NO JSON braces, NO quotes).

// 16 hex chars = 64 bits = 16 nibbles. Max Hamming distance per nibble is 4
// (all 4 bits differ); per char comparison we count differing bits in xor.
export const SHA16_HEX_LEN = 16;
export const SHA16_BIT_LEN = 64;

const HEX_RE = /^[0-9a-f]{16}$/i;

function assertSha16(label, value) {
  if (typeof value !== 'string' || !HEX_RE.test(value)) {
    throw new TypeError(`${label}: expected 16-hex-char sha16 string (got ${typeof value === 'string' ? JSON.stringify(value) : typeof value})`);
  }
}

// Popcount over a single nibble (0..15).
function popcountNibble(n) {
  // 4-bit popcount via classic SWAR fold (no Math.clz32 nonsense for 4 bits).
  n = n - ((n >> 1) & 0x5);
  n = (n & 0x3) + ((n >> 2) & 0x3);
  return n;
}

/**
 * Hamming distance between two sha16 hex strings, counted at the bit level
 * (nibble-by-nibble xor → popcount). Returns integer in [0, 64].
 */
export function hammingDistance(sha16A, sha16B) {
  assertSha16('hammingDistance: sha16A', sha16A);
  assertSha16('hammingDistance: sha16B', sha16B);
  const a = sha16A.toLowerCase();
  const b = sha16B.toLowerCase();
  let dist = 0;
  for (let i = 0; i < SHA16_HEX_LEN; i++) {
    const na = parseInt(a[i], 16);
    const nb = parseInt(b[i], 16);
    dist += popcountNibble(na ^ nb);
  }
  return dist;
}

/**
 * Symmetric similarity in [0, 1]. 1.0 = identical, 0.0 = maximally distant.
 */
export function pidSimilarity(pidA, pidB) {
  const d = hammingDistance(pidA, pidB);
  return 1 - d / SHA16_BIT_LEN;
}

function pidOf(h, idx) {
  if (h == null || typeof h.pid !== 'string') {
    throw new TypeError(`buildProximityGraph: hypothesis[${idx}].pid (string) required`);
  }
  return h.pid;
}

/**
 * Build proximity graph as an adjacency Map.
 *
 * @param {object} opts
 * @param {Array<{pid:string}>} opts.hypotheses  each entry must have .pid
 * @param {number} [opts.threshold=0.4]  similarity ≥ threshold → edge
 * @returns {Map<string, Set<string>>}  pid → set of neighbor pids (undirected)
 *
 * Self-edges are NOT included. Duplicate pids collapse into one vertex.
 */
export function buildProximityGraph({ hypotheses, threshold = 0.4 } = {}) {
  if (!Array.isArray(hypotheses)) {
    throw new TypeError('buildProximityGraph: opts.hypotheses (array) required');
  }
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    throw new TypeError('buildProximityGraph: opts.threshold must be a finite number');
  }
  const graph = new Map();
  const pids = [];
  for (let i = 0; i < hypotheses.length; i++) {
    const pid = pidOf(hypotheses[i], i);
    if (!graph.has(pid)) {
      graph.set(pid, new Set());
      pids.push(pid);
    }
  }
  for (let i = 0; i < pids.length; i++) {
    for (let j = i + 1; j < pids.length; j++) {
      const sim = pidSimilarity(pids[i], pids[j]);
      if (sim >= threshold) {
        graph.get(pids[i]).add(pids[j]);
        graph.get(pids[j]).add(pids[i]);
      }
    }
  }
  return graph;
}

/**
 * Connected-component clustering via BFS over the adjacency map.
 * Returns clusters as arrays of pids. Singletons are included.
 * Cluster order: hypothesis input order; member order: BFS visit order.
 */
export function clusterByProximity({ graph, hypotheses } = {}) {
  if (!(graph instanceof Map)) {
    throw new TypeError('clusterByProximity: opts.graph (Map) required');
  }
  if (!Array.isArray(hypotheses)) {
    throw new TypeError('clusterByProximity: opts.hypotheses (array) required');
  }
  const seen = new Set();
  const clusters = [];
  for (let i = 0; i < hypotheses.length; i++) {
    const start = pidOf(hypotheses[i], i);
    if (seen.has(start)) continue;
    if (!graph.has(start)) {
      // PID not in graph (caller passed mismatched inputs): treat as singleton.
      seen.add(start);
      clusters.push([start]);
      continue;
    }
    const cluster = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const node = queue.shift();
      cluster.push(node);
      const neighbors = graph.get(node);
      if (!neighbors) continue;
      for (const next of neighbors) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/**
 * De-duplicate hypotheses by collapsing high-similarity clusters to one
 * representative each. The representative is the FIRST hypothesis (input
 * order) within each cluster.
 *
 * @param {object} opts
 * @param {Array<{pid:string}>} opts.hypotheses
 * @param {number} [opts.threshold=0.9]
 * @returns {Array<object>}  subset of the input array (same object refs)
 */
export function dedupHypotheses({ hypotheses, threshold = 0.9 } = {}) {
  if (!Array.isArray(hypotheses)) {
    throw new TypeError('dedupHypotheses: opts.hypotheses (array) required');
  }
  const graph = buildProximityGraph({ hypotheses, threshold });
  const clusters = clusterByProximity({ graph, hypotheses });
  // For each cluster pick the first hypothesis whose pid appears in it.
  const byPid = new Map();
  for (let i = 0; i < hypotheses.length; i++) {
    const pid = pidOf(hypotheses[i], i);
    if (!byPid.has(pid)) byPid.set(pid, hypotheses[i]);
  }
  return clusters.map((c) => byPid.get(c[0]));
}

/**
 * Prioritized tournament pairs for the Ranking agent (§3.3.3 prefers similar
 * hypotheses paired first — sharper differential ranking).
 *
 * @param {object} opts
 * @param {Map<string, Set<string>>} opts.graph
 * @param {Array<{pid:string}>} opts.hypotheses
 * @param {number} [opts.topK=10]
 * @returns {Array<{a:string, b:string, similarity:number, priority:number}>}
 *   sorted by similarity DESC; priority = rank index (0 = highest priority).
 */
export function prioritizedPairsForTournament({ graph, hypotheses, topK = 10 } = {}) {
  if (!(graph instanceof Map)) {
    throw new TypeError('prioritizedPairsForTournament: opts.graph (Map) required');
  }
  if (!Array.isArray(hypotheses)) {
    throw new TypeError('prioritizedPairsForTournament: opts.hypotheses (array) required');
  }
  if (!Number.isInteger(topK) || topK < 0) {
    throw new TypeError('prioritizedPairsForTournament: opts.topK must be a non-negative integer');
  }
  const seenPid = new Set();
  const orderedPids = [];
  for (let i = 0; i < hypotheses.length; i++) {
    const pid = pidOf(hypotheses[i], i);
    if (!seenPid.has(pid)) {
      seenPid.add(pid);
      orderedPids.push(pid);
    }
  }
  const pairs = [];
  for (let i = 0; i < orderedPids.length; i++) {
    const a = orderedPids[i];
    const adj = graph.get(a);
    if (!adj) continue;
    for (let j = i + 1; j < orderedPids.length; j++) {
      const b = orderedPids[j];
      if (!adj.has(b)) continue;
      const similarity = pidSimilarity(a, b);
      pairs.push({ a, b, similarity });
    }
  }
  // Sort by similarity DESC. Tie-break by lexicographic (a,b) for determinism.
  pairs.sort((x, y) => {
    if (y.similarity !== x.similarity) return y.similarity - x.similarity;
    if (x.a !== y.a) return x.a < y.a ? -1 : 1;
    return x.b < y.b ? -1 : 1;
  });
  const limited = pairs.slice(0, topK);
  return limited.map((p, idx) => ({ a: p.a, b: p.b, similarity: p.similarity, priority: idx }));
}

// ---------------------------------------------------------------------------
// HBPv1 pipe-row serializers (NO JSON, NO quotes, NO braces).
// Format: TYPE|key=value|key=value...
// Similarity formatted to 4 decimal places for stability across hosts.
// ---------------------------------------------------------------------------

function fmtSim(sim) {
  if (typeof sim !== 'number' || !Number.isFinite(sim)) {
    throw new TypeError('fmtSim: similarity must be a finite number');
  }
  return sim.toFixed(4);
}

/**
 * Emit one HBPv1 pipe-row for a proximity edge.
 * Accepts {a, b, similarity} (hamming derived) or {a, b, similarity, hamming}.
 */
export function toGraphRow(edge) {
  if (edge == null || typeof edge.a !== 'string' || typeof edge.b !== 'string') {
    throw new TypeError('toGraphRow: edge {a, b} (strings) required');
  }
  if (typeof edge.similarity !== 'number') {
    throw new TypeError('toGraphRow: edge.similarity (number) required');
  }
  const hamming = Number.isInteger(edge.hamming) ? edge.hamming : hammingDistance(edge.a, edge.b);
  return `PROX-EDGE|a=${edge.a}|b=${edge.b}|similarity=${fmtSim(edge.similarity)}|hamming=${hamming}`;
}

/**
 * Emit one HBPv1 pipe-row for a cluster.
 */
export function toClusterRow(cluster, idx) {
  if (!Array.isArray(cluster) || cluster.length === 0) {
    throw new TypeError('toClusterRow: cluster (non-empty array) required');
  }
  if (!Number.isInteger(idx) || idx < 0) {
    throw new TypeError('toClusterRow: idx (non-negative integer) required');
  }
  for (const m of cluster) {
    if (typeof m !== 'string') {
      throw new TypeError('toClusterRow: cluster members must be pid strings');
    }
  }
  return `PROX-CLUSTER|id=${idx}|size=${cluster.length}|members=${cluster.join(',')}`;
}
