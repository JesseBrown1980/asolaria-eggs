#!/usr/bin/env node
'use strict';

// OMNIFILE SHARE MIRROR — implements LIRIS's shareId-based contract on ACER :4945.
// Bilateral parity: acer runs BOTH :4954 (path-based) AND :4945 (shareId-based, liris-spec).
// Liris is converging to HBPv1 + port-io-supervisor; this mirror ensures contract interop both ways.
// Per operator 2026-05-28 bilateral directive. HBPv1 default, JSON cold-egress opt-in.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const { createPortIoSupervisor } = require('./behcs/port-io-supervisor');

const PORT = Number(process.env.OMNIFILE_MIRROR_PORT || 4945);
const HOST = process.env.OMNIFILE_MIRROR_HOST || '0.0.0.0';
const ROOT = process.env.OMNIFILE_MIRROR_ROOT || 'D:/BEHCS-Omnifile';
const VANTAGE = process.env.OMNIFILE_VANTAGE || 'acer';
const VANTAGE_IP = process.env.OMNIFILE_VANTAGE_IP || '192.168.1.50';
const PEER_IP = process.env.OMNIFILE_PEER_IP || '192.168.1.17';
const PEER_URL = process.env.OMNIFILE_PEER_URL || `http://${PEER_IP}:${PORT}`;
const HOSTNAME = require('os').hostname();

const MIRROR_DIR = path.join(ROOT, 'mirror', VANTAGE);
const MANIFEST_HBP = path.join(MIRROR_DIR, 'manifest.hbp');
const INBOX_DIR = path.join(MIRROR_DIR, 'inbox');
const QUARTETS_DIR = path.join(MIRROR_DIR, 'quartets');
const GNN_EDGES_HBP = path.join(MIRROR_DIR, 'gnn-edges.hbp');

for (const d of [MIRROR_DIR, INBOX_DIR, QUARTETS_DIR]) fs.mkdirSync(d, { recursive: true });

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sha16(buf) { return sha256(buf).slice(0, 16); }
function ts() { return new Date().toISOString(); }
function pipeRows(rows) { return rows.join('\n') + '\n'; }
function jsonOptIn(q) { return q && (q.format === 'json' || q.cold === 'json'); }

let SEQ_COUNTER = 0;
function nextSeq() { SEQ_COUNTER++; return SEQ_COUNTER; }

function readManifest() {
  if (!fs.existsSync(MANIFEST_HBP)) return [];
  const out = [];
  for (const line of fs.readFileSync(MANIFEST_HBP, 'utf8').split('\n')) {
    if (!line.startsWith('SHARE|')) continue;
    const obj = {};
    for (const pair of line.split('|').slice(1)) {
      const eq = pair.indexOf('=');
      if (eq > 0) obj[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    out.push(obj);
  }
  return out;
}

function appendManifest(entry) {
  const row = `SHARE|shareId=${entry.shareId}|path=${entry.path}|kind=${entry.kind}|sha16=${entry.sha16}|bytes=${entry.bytes}|ts=${entry.ts}|seq=${entry.seq}|vantage=${VANTAGE}\n`;
  fs.appendFileSync(MANIFEST_HBP, row);
}

function appendGnnEdge(verb, shareId, peerIp, sha16Tag) {
  const row = `GNN-EDGE|id=omnifile-mirror-${VANTAGE}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}|ts=${ts()}|from=peer:${peerIp || 'self'}|to=share:${shareId}|verb=${verb}|weight=1.0|glyph=HG256:OMNIFILE_MIRROR:${sha16Tag ? sha16Tag.slice(0, 8).toUpperCase() : 'NOOP'}|layer=L23_omnifile_share_fabric_pipe|vantage=${VANTAGE}|contract=shareId-based-liris-spec\n`;
  fs.appendFileSync(GNN_EDGES_HBP, row);
}

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const u = url.parse(req.url, true);
  const peerIp = (req.socket.remoteAddress || '').replace('::ffff:', '');

  if (req.method === 'OPTIONS') return send(res, 200, '');

  if (u.pathname === '/omnifile/health') {
    const body = jsonOptIn(u.query)
      ? JSON.stringify({ ok: true, vantage: VANTAGE, port: PORT, contract: 'shareId-based-liris-spec-mirror', shares: readManifest().length, peer: PEER_URL, ts: ts() })
      : pipeRows([`HEALTH|ok=true|vantage=${VANTAGE}|hostname=${HOSTNAME}|port=${PORT}|contract=shareId-based-liris-spec-mirror|shares=${readManifest().length}|peer=${PEER_URL}|ts=${ts()}`]);
    return send(res, 200, body, jsonOptIn(u.query) ? 'application/json' : 'text/plain; charset=utf-8');
  }

  if (u.pathname === '/omnifile/manifest') {
    const shares = readManifest();
    const body = jsonOptIn(u.query)
      ? JSON.stringify({ ok: true, vantage: VANTAGE, shares })
      : pipeRows([
          `MANIFEST-HEADER|ok=true|vantage=${VANTAGE}|count=${shares.length}|ts=${ts()}`,
          ...shares.map(s => `MANIFEST-ENTRY|shareId=${s.shareId}|path=${s.path}|kind=${s.kind}|sha16=${s.sha16}|bytes=${s.bytes}|ts=${s.ts}|seq=${s.seq}`)
        ]);
    return send(res, 200, body, jsonOptIn(u.query) ? 'application/json' : 'text/plain; charset=utf-8');
  }

  if (u.pathname === '/omnifile/register' && req.method === 'POST') {
    const body = await readBody(req);
    let registerObj;
    try { registerObj = JSON.parse(body.toString('utf8')); } catch (e) {
      return send(res, 400, pipeRows([`REGISTER-ERROR|error=invalid_json_body|msg=${e.message}`]));
    }
    const targetPath = registerObj.path;
    const kind = registerObj.kind || 'unknown';
    if (!targetPath || !fs.existsSync(targetPath)) {
      return send(res, 404, pipeRows([`REGISTER-ERROR|error=path_not_found|path=${targetPath}`]));
    }
    const data = fs.readFileSync(targetPath);
    const sha = sha16(data);
    const shareId = `${VANTAGE}-${sha}-${Date.now()}`;
    const seq = nextSeq();
    const entry = { shareId, path: targetPath, kind, sha16: sha, bytes: data.length, ts: ts(), seq };
    appendManifest(entry);
    appendGnnEdge('register', shareId, peerIp, sha);
    const respBody = jsonOptIn(u.query)
      ? JSON.stringify({ ok: true, ...entry })
      : pipeRows([`REGISTER-ACK|ok=true|shareId=${shareId}|path=${targetPath}|kind=${kind}|sha16=${sha}|bytes=${data.length}|seq=${seq}|ts=${entry.ts}`]);
    return send(res, 200, respBody, jsonOptIn(u.query) ? 'application/json' : 'text/plain; charset=utf-8');
  }

  if (u.pathname.startsWith('/omnifile/pull/') && req.method === 'GET') {
    const shareId = u.pathname.slice('/omnifile/pull/'.length);
    const shares = readManifest();
    const share = shares.find(s => s.shareId === shareId);
    if (!share) {
      return send(res, 404, pipeRows([`PULL-ERROR|error=share_not_found|shareId=${shareId}`]));
    }
    if (!fs.existsSync(share.path)) {
      return send(res, 410, pipeRows([`PULL-ERROR|error=share_path_missing|shareId=${shareId}|path=${share.path}`]));
    }
    const data = fs.readFileSync(share.path);
    appendGnnEdge('pull', shareId, peerIp, share.sha16);
    return send(res, 200, data, 'application/octet-stream');
  }

  if (u.pathname === '/omnifile/push' && req.method === 'POST') {
    // CONTRACT (matches liris-canonical): body = raw octet-stream bytes (NOT JSON-wrapped).
    // Metadata (shareId, kind) supplied via query params OR X-OmniFile-* headers.
    // Fixed 2026-05-28 per liris bilateral self-reflect: prior JSON-wrapped expectation was acer-mirror drift.
    const data = await readBody(req);
    const incomingShareId = String(
      u.query.shareId ||
      req.headers['x-omnifile-share-id'] ||
      req.headers['x-omnifile-shareid'] ||
      `inbox-${VANTAGE}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    );
    const kind = String(
      u.query.kind ||
      req.headers['x-omnifile-kind'] ||
      'unknown'
    );
    const sha = sha16(data);
    const inboxPath = path.join(INBOX_DIR, `${incomingShareId}.bin`);
    fs.writeFileSync(inboxPath, data);
    const quartetHbp = path.join(QUARTETS_DIR, `${incomingShareId}.hbp`);
    const rows = [
      `PUSH-INBOUND|shareId=${incomingShareId}|kind=${kind}|sha16=${sha}|bytes=${data.length}|peerIp=${peerIp}|ts=${ts()}|inboxPath=${inboxPath.replace(/\\/g, '/')}|contract=raw-octet-stream-liris-canonical`
    ];
    fs.writeFileSync(quartetHbp, pipeRows(rows));
    fs.writeFileSync(quartetHbp + '.sha256', sha256(pipeRows(rows)) + '  ' + path.basename(quartetHbp) + '\n');
    appendGnnEdge('push_inbound', incomingShareId, peerIp, sha);
    const respBody = jsonOptIn(u.query)
      ? JSON.stringify({ ok: true, shareId: incomingShareId, sha16: sha, bytes: data.length, ts: ts(), contract: 'raw-octet-stream-liris-canonical' })
      : pipeRows([`PUSH-ACK|ok=true|shareId=${incomingShareId}|sha16=${sha}|bytes=${data.length}|ts=${ts()}|contract=raw-octet-stream-liris-canonical`]);
    return send(res, 200, respBody, jsonOptIn(u.query) ? 'application/json' : 'text/plain; charset=utf-8');
  }

  if (u.pathname === '/omnifile/peer/sync' && req.method === 'POST') {
    // Pull peer manifest and report
    return new Promise(resolve => {
      const peerHealthUrl = `${PEER_URL}/omnifile/manifest`;
      const u2 = url.parse(peerHealthUrl);
      const opts = { hostname: u2.hostname, port: u2.port, path: u2.path, method: 'GET' };
      const peerReq = http.request(opts, peerRes => {
        let buf = '';
        peerRes.on('data', c => buf += c);
        peerRes.on('end', () => {
          const respBody = pipeRows([
            `PEER-SYNC-RESULT|ok=true|peerUrl=${PEER_URL}|peerStatus=${peerRes.statusCode}|peerBytes=${buf.length}|ts=${ts()}`,
            `PEER-SYNC-PREVIEW|first200=${buf.slice(0, 200).replace(/\|/g, '/').replace(/\n/g, ' ')}`
          ]);
          appendGnnEdge('peer_sync', `peer:${PEER_URL}`, peerIp, null);
          send(res, 200, respBody);
          resolve();
        });
      });
      peerReq.on('error', err => {
        const respBody = pipeRows([
          `PEER-SYNC-RESULT|ok=false|peerUrl=${PEER_URL}|error=${err.message}|hint=${err.code === 'ECONNREFUSED' ? 'peer_daemon_not_running_or_firewall_blocking' : 'unknown'}|ts=${ts()}`
        ]);
        send(res, 200, respBody);
        resolve();
      });
      peerReq.end();
    });
  }

  return send(res, 404, pipeRows([
    `UNKNOWN-ROUTE|ok=false|path=${u.pathname}|routes=/omnifile/health,/omnifile/manifest,/omnifile/register(POST),/omnifile/pull/:shareId,/omnifile/push(POST),/omnifile/peer/sync(POST)|cold_egress_json=append_?format=json`
  ]));
}

if (require.main === module) {
  const supervisor = createPortIoSupervisor({
    port: PORT,
    vantage: VANTAGE,
    role: 'omnifile-share-mirror',
    hookwallPath: path.join(MIRROR_DIR, 'port-io-supervisor-hookwall.hbp'),
    gnnPath: path.join(MIRROR_DIR, 'port-io-supervisor-edges.hbp'),
    whiteRoomPath: path.join(MIRROR_DIR, 'port-io-supervisor-compactions.hbp'),
    profHeartbeatPath: path.join(MIRROR_DIR, `port-io-supervisor-prof-${PORT}.hbp`),
    whiteRoomCompactEvery: 100,
    collisionAvoidance: true
  });

  let heartbeatTick = 1;
  let lastHbHash = supervisor.heartbeat(heartbeatTick, process.pid, 0, Math.round(process.memoryUsage().rss / 1048576), '0000000000000000');
  const startupTs = Date.now();
  setInterval(() => {
    heartbeatTick++;
    const uptime = Math.floor((Date.now() - startupTs) / 1000);
    const mem = Math.round(process.memoryUsage().rss / 1048576);
    lastHbHash = supervisor.heartbeat(heartbeatTick, process.pid, uptime, mem, lastHbHash);
  }, 60000);

  const server = http.createServer(supervisor.wrap(handle));
  server.listen(PORT, HOST, () => {
    const rows = [
      `OMNIFILE-SHARE-MIRROR-LIVE|vantage=${VANTAGE}|hostname=${HOSTNAME}|bind=${HOST}:${PORT}|contract=shareId-based-liris-spec-mirror|root=${ROOT}|mirrorDir=${MIRROR_DIR.replace(/\\/g, '/')}|peer=${PEER_URL}|ts=${ts()}`,
      `PORT-IO-SUPERVISOR|profPid=${supervisor.profPid}|active=true|fabricLayer=L24_port_io_supervisor_fabric`,
      `CANON|hbp_default=true|json_opt_in=?format=json|gnn_edges_hbp=true`,
      `ACCESS|via_localhost=http://127.0.0.1:${PORT}/omnifile/health|via_lan=http://${VANTAGE_IP}:${PORT}/omnifile/health`,
      `PEER-PROBE|via=peer/sync_endpoint|target=${PEER_URL}/omnifile/manifest|blocked_by=acer_windows_firewall_for_inbound_to_4945_until_operator_opens`,
    ];
    process.stdout.write(rows.join('\n') + '\n');
  });
}

module.exports = { handle, readManifest, appendManifest, appendGnnEdge };
