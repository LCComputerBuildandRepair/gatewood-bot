'use strict';
/**
 * In-game bridge — a tiny HTTP API the FiveM resource in
 * `fivem-resource/gatewood_bridge` talks to.
 *
 * It binds to 127.0.0.1 by default, so nothing outside the box can reach it,
 * and every request must carry `X-Auth: <BRIDGE_SECRET>`.
 *
 * FXServer → bot:
 *   POST /join      { name, license, discord, id }
 *   POST /leave     { name, license, reason }
 *   POST /chat      { name, message }
 *   POST /report    { name, license, target, reason }
 *   POST /log       { title, message, level }
 *   GET  /whitelist?license=… | ?discord=…   → { allowed, priority, tier }
 *
 * Bot → FXServer (polled by the resource, so no inbound port on the game side):
 *   GET  /outbound  → { messages: [ { author, content } ], commands: [ … ] }
 */
const http = require('http');
const { URL } = require('url');

const config = require('./config');
const db = require('./database');
const E = require('./utils/embeds');
const { logTo, channelByKey, clamp } = require('./utils/helpers');

let server = null;
let clientRef = null;

// Messages typed in #in-game-chat, waiting for the resource to collect them.
const outbox = [];
const MAX_OUTBOX = 100;

/** Queue a Discord message for relay into in-game chat. */
function pushToGame(author, content) {
  outbox.push({ author, content, at: Date.now() });
  while (outbox.length > MAX_OUTBOX) outbox.shift();
}

function guild() {
  return clientRef?.guilds.cache.get(config.guildId) || null;
}

// ── Handlers ─────────────────────────────────────────────────────────────────
const handlers = {
  async join(body) {
    const g = guild();
    if (!g) return { ok: true };
    const linked = body.discord ? `<@${body.discord}>` : null;
    const embed = E.base(E.COLORS.success)
      .setTitle('🟩 Player connected')
      .setDescription(`**${clamp(body.name, 100)}**${linked ? ` — ${linked}` : ''}`)
      .addFields(
        { name: 'Server ID', value: String(body.id ?? '—'), inline: true },
        { name: 'License', value: `\`${clamp(body.license || '—', 60)}\``, inline: true },
      );
    await logTo(g, 'ingame_feed', embed);
    return { ok: true };
  },

  async leave(body) {
    const g = guild();
    if (!g) return { ok: true };
    const embed = E.base(E.COLORS.dark)
      .setTitle('🟥 Player disconnected')
      .setDescription(`**${clamp(body.name, 100)}**`)
      .addFields({ name: 'Reason', value: clamp(body.reason || 'Unknown', 200) });
    await logTo(g, 'ingame_feed', embed);
    return { ok: true };
  },

  async chat(body) {
    const g = guild();
    if (!g) return { ok: true };
    const ch = await channelByKey(g, 'ingame_chat');
    if (ch?.isTextBased()) {
      await ch.send({
        content: `\`${clamp(body.name || 'Unknown', 40)}\` ${clamp(body.message, 1800)}`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }
    return { ok: true };
  },

  async report(body) {
    const g = guild();
    if (!g) return { ok: true };
    const embed = E.base(E.COLORS.error)
      .setTitle('🚩 In-game report')
      .addFields(
        { name: 'From', value: clamp(body.name || 'Unknown', 100), inline: true },
        { name: 'About', value: clamp(body.target || '—', 100), inline: true },
        { name: 'License', value: `\`${clamp(body.license || '—', 60)}\``, inline: false },
        { name: 'Reason', value: clamp(body.reason || '—', 1000) },
      );
    const ch = await channelByKey(g, 'reports');
    if (ch?.isTextBased()) {
      const { onlineStaffMention } = require('./utils/helpers');
      const { STAFF_KEYS } = require('./structure');
      await ch.send({ content: onlineStaffMention(g, STAFF_KEYS), embeds: [embed] }).catch(() => {});
    }
    return { ok: true };
  },

  async log(body) {
    const g = guild();
    if (!g) return { ok: true };
    const colorFor = { error: E.COLORS.error, warn: E.COLORS.warn, info: E.COLORS.info };
    const embed = E.base(colorFor[body.level] || E.COLORS.info)
      .setTitle(clamp(body.title || 'Server log', 240))
      .setDescription(clamp(body.message || '—', 3800));
    await logTo(g, 'server_logs', embed);
    return { ok: true };
  },

  /**
   * Whitelist / priority check, called from the resource's playerConnecting.
   * Answers from the bot's own records: an approved application (or open
   * whitelist mode) plus any priority-queue slots the member has.
   */
  async whitelist(_body, url) {
    const license = url.searchParams.get('license');
    const discordId = url.searchParams.get('discord');
    const g = guild();

    const mode = db.get('whitelistMode', 'open');
    let userId = discordId || (license ? db.userByLicense(license) : null);

    let allowed = mode === 'open';
    let tier = null;
    let priority = 0;

    if (userId && g) {
      const member = await g.members.fetch(userId).catch(() => null);
      if (member) {
        const wlRole = db.roleId('whitelist');
        if (mode === 'open') allowed = true;
        else if (wlRole && member.roles.cache.has(wlRole)) allowed = true;

        const p = db.getPriority(userId);
        if (p && (!p.until || p.until > Date.now())) {
          priority = p.slots || 0;
          tier = p.tier || null;
        }
        // Staff always get in, and always get the top of the queue.
        const { isStaff } = require('./utils/helpers');
        if (isStaff(member)) { allowed = true; priority = Math.max(priority, 100); tier = tier || 'staff'; }
      }
    }
    return { ok: true, allowed, priority, tier, mode, linked: !!userId };
  },

  async outbound() {
    const messages = outbox.splice(0, outbox.length);
    return { ok: true, messages };
  },
};

// ── HTTP plumbing ────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 64 * 1024) req.destroy(); // never buffer more than 64 KB
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function send(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function route(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${config.bridge.port}`);
  const name = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (name === 'health') return send(res, 200, { ok: true, bot: !!clientRef?.user?.id });

  if (!config.bridge.secret || req.headers['x-auth'] !== config.bridge.secret) {
    return send(res, 401, { ok: false, error: 'bad or missing X-Auth header' });
  }

  const handler = handlers[name];
  if (!handler) return send(res, 404, { ok: false, error: `unknown endpoint '${name}'` });

  const body = req.method === 'POST' ? await readBody(req) : {};
  try {
    const result = await handler(body, url);
    send(res, 200, result);
  } catch (err) {
    console.error(`[bridge] ${name} failed:`, err.message);
    send(res, 500, { ok: false, error: err.message });
  }
}

function start(client) {
  if (!config.bridge.enabled) {
    console.log('[bridge] disabled (BRIDGE_ENABLED=false).');
    return;
  }
  if (!config.bridge.secret || config.bridge.secret.length < 12) {
    console.warn('[bridge] refusing to start: set a BRIDGE_SECRET of at least 12 characters in .env.');
    return;
  }
  clientRef = client;
  server = http.createServer((req, res) => { route(req, res).catch(() => send(res, 500, { ok: false })); });
  server.listen(config.bridge.port, '127.0.0.1', () => {
    console.log(`[bridge] listening on http://127.0.0.1:${config.bridge.port}`);
  });
  server.on('error', (err) => console.error('[bridge] server error:', err.message));
}

function stop() {
  if (server) server.close();
  server = null;
}

module.exports = { start, stop, pushToGame };
