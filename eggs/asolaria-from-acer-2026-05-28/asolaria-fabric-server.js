"use strict";
// asolaria-fabric MCP server v0.2 — STUDIED endpoints + full federation surface
// Built 2026-05-23 per OP-JESSE deep-reflection directive (V26-004 -> V27-001..018, cosign seq=222..224)
// 18 tools wrap live :4949 super-dashboard. Subagents inheriting workspace .mcp.json get
// federation primitives as native MCP tools.

const fs = require("node:fs");
const crypto = require("node:crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const z = require("zod/v4");

const DEFAULT_BASE_URL = "http://127.0.0.1:4949";
const ASOLARIA_FABRIC_URL =
  (process.env.ASOLARIA_FABRIC_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const COSIGN_CHAIN_PATH = "C:/asolaria-acer/COSIGN_CHAIN.ndjson";

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function tupleClean(value, max = 2400) {
  return String(value ?? "")
    .replace(/[|\r\n\t]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function tupleRow(tag, fields = {}) {
  return `${tag}|${Object.entries(fields)
    .map(([k, v]) => `${tupleClean(k, 80)}=${tupleClean(v)}`)
    .join("|")}`;
}

function tupleResult(tag, payload) {
  const rows = [tupleRow(`${tag}RUN`, { format: "hyperbehcs_tuple_text", sha256: sha256Text(JSON.stringify(payload ?? null)) })];
  const seen = new WeakSet();
  const walk = (pointer, value, depth) => {
    if (rows.length >= 220 || depth > 4) return;
    const t = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    const ptr = tupleClean(pointer, 240);
    if (t === "string") {
      const text = String(value);
      rows.push(tupleRow(`${tag}VAL`, {
        path: ptr, type: t, chars: text.length, sha256: sha256Text(text),
        value: text.length <= 1200 ? text : `[${text.length} chars]`,
      }));
      return;
    }
    if (t === "number" || t === "boolean" || t === "null") {
      rows.push(tupleRow(`${tag}VAL`, { path: ptr, type: t, value: value === null ? "null" : value }));
      return;
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        rows.push(tupleRow(`${tag}ARR`, { path: ptr, count: value.length }));
        value.slice(0, 40).forEach((it, i) => walk(`${pointer}.${i}`, it, depth + 1));
      } else {
        const keys = Object.keys(value);
        rows.push(tupleRow(`${tag}OBJ`, { path: ptr, keys: keys.length }));
        keys.slice(0, 80).forEach((k) => walk(`${pointer}.${k}`, value[k], depth + 1));
      }
    }
  };
  walk("root", payload, 0);
  return rows.join("\n");
}

async function fabricGet(path) {
  const url = `${ASOLARIA_FABRIC_URL}${path}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text.slice(0, 4000) }; }
  if (!res.ok) throw new Error(`fabric GET ${path} -> ${res.status}: ${(parsed && parsed.error) || text.slice(0, 300)}`);
  return parsed ?? {};
}

async function fabricPost(path, body) {
  const url = `${ASOLARIA_FABRIC_URL}${path}`;
  const res = await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text.slice(0, 4000) }; }
  if (!res.ok) throw new Error(`fabric POST ${path} -> ${res.status}: ${(parsed && parsed.error) || text.slice(0, 300)}`);
  return parsed ?? {};
}

function readCosignTail(n = 10) {
  const raw = fs.readFileSync(COSIGN_CHAIN_PATH, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const tail = lines.slice(-n);
  const parsed = tail.map((line) => {
    try { return JSON.parse(line); }
    catch { return { _unparseable: line.slice(0, 200) }; }
  });
  return { total_lines: lines.length, returned: parsed.length, tail: parsed };
}

const mcp = new McpServer({ name: "asolaria-fabric", version: "0.2.0" });

// === 9 ORIGINAL TOOLS (3 dropped/replaced) ===
mcp.registerTool("asolaria_fabric_health", { description: "GET :4949/health — apex+operator_pair+uptime.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABHEALTH", await fabricGet("/health")) }] }));

mcp.registerTool("asolaria_fabric_everything", { description: "GET :4949/api/everything — federation route map + cohort artifacts.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABEVERY", await fabricGet("/api/everything")) }] }));

mcp.registerTool("asolaria_fabric_supervisors", { description: "GET :4949/api/supervisors — 234-council + 24 domain classes.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABSUP", await fabricGet("/api/supervisors")) }] }));

mcp.registerTool("asolaria_fabric_canon_index", { description: "GET :4949/api/canon-index — memory canon (370 .md / 332 indexed / 38 orphans).", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABCANIDX", await fabricGet("/api/canon-index")) }] }));

mcp.registerTool("asolaria_fabric_council_query",
  { description: "POST :4949/api/council/query — ask 234-supervisor council; returns fired envelope ID.",
    inputSchema: { topic: z.string().min(1), keywords: z.array(z.string()).min(1).max(20) } },
  async ({ topic, keywords }) => ({ content: [{ type: "text", text: tupleResult("ASOFABCOUNCIL", await fabricPost("/api/council/query", { topic, keywords })) }] }));

mcp.registerTool("asolaria_fabric_sister_organ", { description: "GET :4949/api/sister-organ — liris :4944 bilateral mirror health.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABSIS", await fabricGet("/api/sister-organ")) }] }));

mcp.registerTool("asolaria_fabric_gnn_topn", { description: "GET :4949/api/gnn/topN — top-N GNN inference (verified-empty-as-of-2026-05-23; may populate).", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABGNN", await fabricGet("/api/gnn/topN")) }] }));

// === LIVE COSIGN CHAIN (replaces stale dashboard mirror) ===
mcp.registerTool("asolaria_fabric_cosign_chain_live",
  { description: "Read tail of C:/asolaria-acer/COSIGN_CHAIN.ndjson directly (live single-line ndjson; supersedes stale dashboard mirror).",
    inputSchema: { count: z.number().int().min(1).max(50).default(10).optional() } },
  async ({ count } = {}) => ({ content: [{ type: "text", text: tupleResult("ASOFABCOSIGNLIVE", readCosignTail(count || 10)) }] }));

// === 10 NEW TOOLS (full federation surface) ===
mcp.registerTool("asolaria_fabric_omniscrcpy_status", { description: "GET :4949/api/omniscrcpy/status — PIXEL surface (Jesse-piped; agents read screen pre-GPU via lanes/screencap).", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABSCRCPY", await fabricGet("/api/omniscrcpy/status")) }] }));

mcp.registerTool("asolaria_fabric_omni_control_status", { description: "GET :4949/api/omni-control/status — LOOK/TYPE/KEY bridge (LOOK=screencap, TYPE=input text, ENTER=keyevent 66).", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABCTRL", await fabricGet("/api/omni-control/status")) }] }));

mcp.registerTool("asolaria_fabric_loop_tick", { description: "GET :4949/api/loop/tick — fires auto-self-improve loop tick; returns inferred/staged/pending counts + 8-stage review pipeline.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABLOOPTICK", await fabricGet("/api/loop/tick")) }] }));

mcp.registerTool("asolaria_fabric_loop_pending", { description: "GET :4949/api/loop/pending — pending review-pipeline envelopes (HOOKWALL/PID_LAZY_MINT/BEHCS1024/GNN/SHANNON/GULP/WHITEROOM/FREE_AGENT stages).", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABLOOPPEND", await fabricGet("/api/loop/pending")) }] }));

mcp.registerTool("asolaria_fabric_manifest", { description: "GET :4949/api/manifest — memory canon manifest.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABMANIF", await fabricGet("/api/manifest")) }] }));

mcp.registerTool("asolaria_fabric_glyphs", { description: "GET :4949/api/glyphs — glyph table (256-glyph alphabet substrate).", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABGLYPH", await fabricGet("/api/glyphs")) }] }));

mcp.registerTool("asolaria_fabric_bus_health", { description: "GET :4949/api/bus-health — bus :4947 health.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABBUS", await fabricGet("/api/bus-health")) }] }));

mcp.registerTool("asolaria_fabric_archaeology_timeline", { description: "GET :4949/api/archaeology/timeline — 24+ strata historical timeline.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABARCH", await fabricGet("/api/archaeology/timeline")) }] }));

mcp.registerTool("asolaria_fabric_access_tier_matrix", { description: "GET :4949/api/access-tier/matrix — BEHCS-1024 shadow/restricted/stealth/hidden tier matrix.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABACCESS", await fabricGet("/api/access-tier/matrix")) }] }));

mcp.registerTool("asolaria_fabric_substrates", { description: "GET :4949/api/substrates — 5 anchor substrates.", inputSchema: {} },
  async () => ({ content: [{ type: "text", text: tupleResult("ASOFABSUBS", await fabricGet("/api/substrates")) }] }));

async function main() {
  const t = new StdioServerTransport();
  await mcp.connect(t);
  console.error(`[asolaria-fabric v0.2] MCP server connected. base=${ASOLARIA_FABRIC_URL} tools=18`);
}

main().catch((e) => {
  console.error("[asolaria-fabric] fatal:", e);
  process.exit(1);
});
