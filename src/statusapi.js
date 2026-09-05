'use strict';
/**
 * Public status API — the bridge between this bot and the Gatewood website.
 *
 * The website cannot ask the game server for its player count directly: the
 * cfx.re master list refuses browser requests (and 404s entirely if the server
 * isn't listed), and a browser on an HTTPS site is not allowed to call a plain
 * HTTP game port. So this bot, which already sits on the same box as FXServer,
 * answers that question for it.
 *
 *   GET /status   → live server state as JSON (see payload below)
 *   GET /health   → { ok: true } for uptime monitors
 *
 * WHAT IT EXPOSES: only what the FiveM server already publishes publicly —
 * player count, slots, hostname, resource count, and (optionally, OFF by
 * default) the player-name list. There are no write endpoints, no secrets, no
 * identifiers, and nothing here can change anything. It is safe to open to the
 * internet, which is the point: your website needs to reach it.
 *
 * Unlike the in-game bridge (src/bridge.js, 127.0.0.1 only, secret required),
 * this binds publicly on purpose. Everything it can return is already visible
 * to anyone who joins the server.
 *
 * Turn it on in .env:
 *   STATUS_API_ENABLED=true
 *   STATUS_API_PORT=30123
 */
const http = require('http');
const { URL } = require('url');

const config = require('./config');
const db = require('./database');
const fivem = require('./fivem');

let server = null;
let clientRef = null;

// ── Cache ────────────────────────────────────────────────────────────────────
// One query result shared by every visitor to the site. Without this, a busy
// website would hammer the game server's HTTP endpoints once per page view.
let cache = { at: 0, payload: null };

// ── Uptime tracking ──────────────────────────────────────────────────────────
// FXServer doesn't report its own start time, so we track the transition
// ourselves: the moment we first see it online after being down.
let onlineSince = null;
let lastSeenOnline = null;

// ── Rate limiting ────────────────────────────────────────────────────────────
// Generous — a normal visitor makes one call per page — but enough to stop a
// script pointing itself at this endpoint all day.
const RATE_MAX = 120;
const RATE_WINDOW_MS = 60_000;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

// Keep the rate-limit map from growing forever on a long-running bot.
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) if (now > rec.resetAt) hits.delete(ip);
}, RATE_WINDOW_MS).unref?.();

/**
 * Server vars are free-form — owners put all sorts in there — so publish only
 * the few keys the website actually shows.
 */
const PUBLIC_VARS = ['onesync_enabled', 'locale', 'gamename', 'sv_enforceGameBuild', 'sv_scriptHookAllowed'];
function pickVars(vars) {
  if (!vars || typeof vars !== 'object') return null;
  const out = {};
  for (const k of PUBLIC_VARS) if (vars[k] !== undefined) out[k] = String(vars[k]).slice(0, 60);
  return Object.keys(out).length ? out : null;
}

/** Average ping across connected players, or null. */
function averagePing(list) {
  const pings = (list || []).map((p) => Number(p.ping)).filter((n) => Number.isFinite(n) && n > 0);
  if (!pings.length) return null;
  return Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
}

/**
 * The restart schedule the BOT actually announces, so the website's countdown
 * can never disagree with the warning players see in Discord.
 * db.getRestarts() holds "HH:MM" strings in this machine's local time.
 */
function restartInfo() {
  let schedule = [];
  try {
    schedule = db.getRestarts() || [];
  } catch {
    schedule = [];
  }
  if (!schedule.length) return { schedule: [], next: null };

  const now = new Date();
  let next = null;
  for (const entry of schedule) {
    const [h, m] = String(entry).split(':').map((n) => parseInt(n, 10));
    if (!Number.isFinite(h)) continue;
    const t = new Date(now);
    t.setHours(h, m || 0, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    if (!next || t < next) next = t;
  }
  return { schedule, next: next ? next.getTime() : null };
}

/** Discord community size, straight from the gateway — no extra API call. */
function discordInfo() {
  const guild = clientRef?.guilds?.cache?.get(config.guildId);
  if (!guild) return null;
  let online = null;
  try {
    online = guild.members.cache.filter(
      (m) => m.presence && m.presence.status !== 'offline',
    ).size || null;
  } catch {
    online = null;
  }
  return { members: guild.memberCount ?? null, online };
}

/** Build the payload the website consumes. */
async function buildPayload() {
  const status = await fivem.query();
  const now = Date.now();

  if (status.online) {
    // treat a gap of more than 10 minutes as a restart, not a blip
    if (!onlineSince || (lastSeenOnline && now - lastSeenOnline > 10 * 60_000)) onlineSince = now;
    lastSeenOnline = now;
  } else if (!status.disabled) {
    onlineSince = null;
  }

  const restarts = restartInfo();

  return {
    ok: true,
    source: 'gatewood-bot',
    online: !!status.online,
    disabled: !!status.disabled,
    players: status.players || 0,
    max: status.max || config.server.maxSlots,
    percent: status.max ? Math.round(((status.players || 0) / status.max) * 100) : 0,
    queued: Math.max(0, (status.players || 0) - (status.max || 0)),
    hostname: status.hostname || config.communityName,
    gametype: status.gametype || null,
    mapname: status.mapname || null,
    resources: status.resources ?? null,
    // a deliberate allow-list: server vars can hold anything an owner put there
    vars: pickVars(status.vars),
    averagePing: averagePing(status.list),
    latency: status.latency ?? null,
    onlineSince,
    restarts: restarts.schedule,
    nextRestart: restarts.next,
    discord: discordInfo(),
    connect: {
      cfx: config.server.cfxCode ? `https://cfx.re/join/${config.server.cfxCode}` : null,
      address: config.connectUrl || null,
    },
    // Player names are already visible to anyone in the city, but publishing
    // them on a website is a different thing — so this is opt-in.
    playerList: config.statusApi.showPlayers
      ? (status.list || []).map((p) => ({ name: String(p.name || '').slice(0, 40), ping: Number(p.ping) || null }))
      : null,
    updatedAt: now,
  };
}

async function payload() {
  if (cache.payload && Date.now() - cache.at < config.statusApi.cacheMs) return cache.payload;
  const built = await buildPayload();
  cache = { at: Date.now(), payload: built };
  return built;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function send(res, code, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': config.statusApi.origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    // let a CDN hold it briefly; the data is only as fresh as the cache anyway
    'Cache-Control': `public, max-age=${Math.round(config.statusApi.cacheMs / 1000)}`,
    ...extraHeaders,
  });
  res.end(json);
}

async function handle(req, res) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             req.socket.remoteAddress || 'unknown';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': config.statusApi.origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Method not allowed' });
  if (rateLimited(ip)) return send(res, 429, { ok: false, error: 'Rate limit exceeded' });

  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
  } catch {
    return send(res, 400, { ok: false, error: 'Bad request' });
  }

  if (pathname === '/health') return send(res, 200, { ok: true, at: Date.now() });
  if (pathname === '/' || pathname === '/status') {
    try {
      return send(res, 200, await payload());
    } catch (err) {
      console.error('[statusapi] failed to build payload:', err.message);
      return send(res, 503, { ok: false, error: 'Status unavailable' });
    }
  }
  return send(res, 404, { ok: false, error: 'Not found' });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
function start(client) {
  clientRef = client;
  if (!config.statusApi.enabled) return;
  if (server) return;

  server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('[statusapi]', err);
      try { send(res, 500, { ok: false, error: 'Internal error' }); } catch {}
    });
  });

  server.on('error', (err) => {
    console.error(`[statusapi] could not listen on ${config.statusApi.host}:${config.statusApi.port} — ${err.message}`);
    server = null;
  });

  server.listen(config.statusApi.port, config.statusApi.host, () => {
    console.log(`[statusapi] public status API on http://${config.statusApi.host}:${config.statusApi.port}/status`);
    if (config.statusApi.showPlayers) console.log('[statusapi] player names ARE being published (STATUS_API_SHOW_PLAYERS=true).');
  });
}

function stop() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { start, stop, payload };
