#!/usr/bin/env node
'use strict';

// PORT-IO-SUPERVISOR — generic PROF supervisor that wraps any HTTP port.
// Per operator 2026-05-28: "inout output supervisor and PID prof that allows division
// of the port by addressing the incoming and outgoing. we did that and were supposed
// to add that ability to any port or node that might cause a non wanted collision.
// The 1e200 depends on those. Supervisors and agents and PROFS and supervisors with
// the router on the port allows the introspective part as well as they are
// 'watching and routing' they are hookwalled and connected to the GNNs, and white rooms,
// with the same process that we use with the FREE agent 100B runs"
//
// Pattern: wraps an HTTP handler. Each request gets:
//   - PROF supervisor mint (heartbeat)
//   - Transaction ID (collision-free via {ts, counter, sha16})
//   - Address division: INBOUND_READ vs INBOUND_WRITE vs OUTBOUND_RESPONSE — separate address spaces
//   - Hookwall log per lane (3-lane separation prevents read/write/response collision)
//   - GNN edge per access into L24_port_io_supervisor_fabric
//   - White-room compaction every N requests
//   - PROF PID-specific identity (per-port supervisor, no cross-port collision)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sha16(buf) { return sha256(buf).slice(0, 16); }
function ts() { return new Date().toISOString(); }

let GLOBAL_TX_COUNTER = 0;

function nextTxId(profPid) {
  GLOBAL_TX_COUNTER++;
  const seed = `${profPid}-${Date.now()}-${GLOBAL_TX_COUNTER}-${Math.random().toString(36).slice(2, 8)}`;
  return `TX-${sha16(seed).toUpperCase()}`;
}

function classifyRequest(req) {
  // 3-lane address division
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'INBOUND_READ';
  if (method === 'PUT' || method === 'POST' || method === 'PATCH' || method === 'DELETE') return 'INBOUND_WRITE';
  return 'INBOUND_UNKNOWN';
}

function classifyResponse(statusCode) {
  if (statusCode >= 200 && statusCode < 300) return 'OUTBOUND_RESPONSE_OK';
  if (statusCode >= 300 && statusCode < 400) return 'OUTBOUND_RESPONSE_REDIRECT';
  if (statusCode >= 400 && statusCode < 500) return 'OUTBOUND_RESPONSE_CLIENT_ERR';
  if (statusCode >= 500) return 'OUTBOUND_RESPONSE_SERVER_ERR';
  return 'OUTBOUND_RESPONSE_UNKNOWN';
}

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function mintProfPid(port, vantage, role) {
  const hilbert = port; // map port directly to hilbert for traceability
  const hex = sha16(`port-io-prof-${vantage}-${role}-${port}`).toUpperCase();
  return `AGT-L3-PORT-IO-PROF-${role.toUpperCase()}-PORT-${port}-H${hex}-W150-P00-N${hilbert.toString(16).padStart(5, '0').toUpperCase()}`;
}

function createPortIoSupervisor(opts) {
  const {
    port,
    vantage = 'acer',
    role = 'omnifile-share',
    hookwallPath,
    gnnPath,
    whiteRoomPath,
    profHeartbeatPath,
    whiteRoomCompactEvery = 100,
    collisionAvoidance = true
  } = opts;

  if (!port) throw new Error('createPortIoSupervisor: port is required');
  if (!hookwallPath || !gnnPath) throw new Error('createPortIoSupervisor: hookwallPath + gnnPath required');

  const profPid = mintProfPid(port, vantage, role);
  const startTs = ts();
  let txTotal = 0;
  const lanesSeen = { INBOUND_READ: 0, INBOUND_WRITE: 0, INBOUND_UNKNOWN: 0, OUTBOUND_RESPONSE_OK: 0, OUTBOUND_RESPONSE_REDIRECT: 0, OUTBOUND_RESPONSE_CLIENT_ERR: 0, OUTBOUND_RESPONSE_SERVER_ERR: 0 };
  let collisionDetectedCount = 0;
  const seenTxIds = new Set();

  ensureDir(hookwallPath);
  ensureDir(gnnPath);
  if (whiteRoomPath) ensureDir(whiteRoomPath);
  if (profHeartbeatPath) ensureDir(profHeartbeatPath);

  function logHookwall(lane, txId, reqPath, peerIp, sizeBytes, sha16Tag) {
    const row = `PORT-IO-SUPERVISOR|profPid=${profPid}|ts=${ts()}|vantage=${vantage}|role=${role}|port=${port}|lane=${lane}|txId=${txId}|reqPath=${reqPath}|peerIp=${peerIp}|bytes=${sizeBytes}|sha16=${sha16Tag || 'na'}\n`;
    fs.appendFileSync(hookwallPath, row);
  }

  function logGnnEdge(lane, txId, reqPath, peerIp, sha16Tag) {
    // HBPv1 hot path: pipe-delimited row, NOT JSON. Per operator canon enforcement 2026-05-28.
    const row = `GNN-EDGE|id=port-io-${role}-${txId}-${lane}|ts=${ts()}|profPid=${profPid}|from=peer:${peerIp || 'self'}|to=port-io-lane:${lane}:${reqPath}|verb=${lane.toLowerCase()}|weight=1.0|glyph=HG256:PORT_IO_${lane}:${sha16Tag ? sha16Tag.slice(0,8).toUpperCase() : 'NOOP'}|layer=L24_port_io_supervisor_fabric|port=${port}|role=${role}|vantage=${vantage}\n`;
    fs.appendFileSync(gnnPath, row);
  }

  function compactWhiteRoom() {
    if (!whiteRoomPath) return;
    const row = `WHITE-ROOM-COMPACT|profPid=${profPid}|ts=${ts()}|port=${port}|role=${role}|txTotal=${txTotal}|lanes=${JSON.stringify(lanesSeen)}|collisions=${collisionDetectedCount}|startTs=${startTs}\n`;
    fs.appendFileSync(whiteRoomPath, row);
  }

  function heartbeat(tick, hostProcessPid, hostUptimeS, hostMemMb, prevHash) {
    if (!profHeartbeatPath) return null;
    const row = `HBPv1|layer=port-io-supervisor-heartbeat|anchor_pid=ASOLARIA-PORT-IO-SUPERVISOR-CONSTELLATION-PID-2026-05-28|embodied_pid=${profPid}|tick=${tick}|ts=${ts()}|host_process_pid=${hostProcessPid}|host_uptime_s=${hostUptimeS}|host_mem_mb=${hostMemMb}|node_version=${process.version}|port=${port}|role=${role}|tx_total=${txTotal}|collisions=${collisionDetectedCount}|antecedents=${prevHash || '0000000000000000'}|json=0|runtime=1|promote=0|row_hash=${sha16(profPid + tick + ts())}`;
    const fullRow = row + '\n';
    fs.appendFileSync(profHeartbeatPath, fullRow);
    return sha16(profPid + tick + ts());
  }

  function wrap(handler) {
    return function wrapped(req, res) {
      txTotal++;
      const txId = nextTxId(profPid);

      if (collisionAvoidance) {
        if (seenTxIds.has(txId)) {
          collisionDetectedCount++;
          logHookwall('COLLISION_DETECTED', txId, req.url || '/', (req.socket.remoteAddress || '').replace('::ffff:', ''), 0);
        }
        seenTxIds.add(txId);
        // GC the set if it grows too large (keep last 10k tx ids)
        if (seenTxIds.size > 10000) {
          const toDrop = Array.from(seenTxIds).slice(0, 5000);
          for (const id of toDrop) seenTxIds.delete(id);
        }
      }

      const inboundLane = classifyRequest(req);
      lanesSeen[inboundLane] = (lanesSeen[inboundLane] || 0) + 1;
      const peerIp = (req.socket.remoteAddress || '').replace('::ffff:', '');
      const reqPath = req.url || '/';
      logHookwall(inboundLane, txId, reqPath, peerIp, 0);
      logGnnEdge(inboundLane, txId, reqPath, peerIp);

      // Patch res.writeHead to capture outbound response classification
      const origWriteHead = res.writeHead.bind(res);
      let outboundLane = null;
      let outboundBytes = 0;
      res.writeHead = function(code, ...rest) {
        outboundLane = classifyResponse(code);
        lanesSeen[outboundLane] = (lanesSeen[outboundLane] || 0) + 1;
        return origWriteHead(code, ...rest);
      };
      const origEnd = res.end.bind(res);
      res.end = function(chunk, ...rest) {
        if (chunk) outboundBytes += Buffer.byteLength(chunk);
        if (outboundLane) {
          logHookwall(outboundLane, txId, reqPath, peerIp, outboundBytes);
          logGnnEdge(outboundLane, txId, reqPath, peerIp);
        }
        if (txTotal % whiteRoomCompactEvery === 0) {
          compactWhiteRoom();
        }
        return origEnd(chunk, ...rest);
      };

      // Attach supervisor metadata to the request for handlers that want it
      req._portIoSupervisor = { profPid, txId, inboundLane, role, port, vantage };

      return handler(req, res);
    };
  }

  function stats() {
    return { profPid, port, role, vantage, txTotal, lanesSeen, collisionDetectedCount, startTs, ts: ts() };
  }

  return { profPid, wrap, heartbeat, compactWhiteRoom, stats };
}

module.exports = { createPortIoSupervisor, classifyRequest, classifyResponse, mintProfPid };
