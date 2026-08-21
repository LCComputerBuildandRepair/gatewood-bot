'use strict';
/**
 * Live FiveM server status.
 *
 * Reads the three JSON endpoints every FXServer exposes on its game port:
 *   /dynamic.json  → hostname, clients, maxclients (cheapest, always there)
 *   /info.json     → server vars (project name, banner, tags, resource count)
 *   /players.json  → the actual player list (names, pings, identifiers)
 *
 * Everything is read-only, so pointing the bot at your server is safe. If the
 * server is unreachable we report OFFLINE rather than throwing.
 */
const config = require('./config');
const db = require('./database');
const E = require('./utils/embeds');
const { channelByKey, ts } = require('./utils/helpers');

const BASE = () => `http://${config.server.host}:${config.server.port}`;
const TIMEOUT_MS = 5000;

async function getJson(pathname) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE()}${pathname}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'gatewood-bot' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Query the server. Always resolves — `{ online: false }` when unreachable.
 * Shape: { online, hostname, players, max, list, resources, uptimeSince, ping }
 */
async function query() {
  if (!config.server.enabled) return { online: false, disabled: true, players: 0, max: 0, list: [] };

  const started = Date.now();
  const [dynamic, info, players] = await Promise.all([
    getJson('/dynamic.json'),
    getJson('/info.json'),
    getJson('/players.json'),
  ]);
  const latency = Date.now() - started;

  if (!dynamic && !info && !players) {
    return { online: false, players: 0, max: config.server.maxSlots, list: [], latency };
  }

  const list = Array.isArray(players) ? players : [];
  const max = Number(dynamic?.sv_maxclients || dynamic?.maxclients || info?.vars?.sv_maxClients || config.server.maxSlots);
  const count = Number.isFinite(Number(dynamic?.clients)) ? Number(dynamic.clients) : list.length;

  return {
    online: true,
    hostname: stripColors(dynamic?.hostname || info?.vars?.sv_projectName || config.communityName),
    gametype: dynamic?.gametype || info?.vars?.gametype || null,
    mapname: dynamic?.mapname || info?.vars?.mapname || null,
    players: count,
    max,
    list,
    resources: Array.isArray(info?.resources) ? info.resources.length : null,
    banner: info?.vars?.banner_connecting || info?.vars?.banner_detail || null,
    latency,
  };
}

/** FiveM hostnames are full of ^1 colour codes and ~r~ tokens. Strip them. */
const stripColors = (s) => String(s || '').replace(/\^\d/g, '').replace(/~[a-z]~/gi, '').trim();

/** Average ping across connected players, or null if unavailable. */
function averagePing(list) {
  const pings = list.map((p) => Number(p.ping)).filter((n) => Number.isFinite(n) && n > 0);
  if (!pings.length) return null;
  return Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
}

/** A 10-cell bar, because a number alone doesn't read as "busy" at a glance. */
function bar(current, max, width = 14) {
  if (!max) return '';
  const filled = Math.max(0, Math.min(width, Math.round((current / max) * width)));
  return `\`${'█'.repeat(filled)}${'░'.repeat(width - filled)}\``;
}

/** Build the live status embed. */
function statusEmbed(status) {
  if (status.disabled) {
    return E.warn('Server status is disabled', 'Set `SERVER_QUERY_ENABLED=true` and the host/port in the bot’s `.env` to turn this on.');
  }

  if (!status.online) {
    return E.base(E.COLORS.error)
      .setTitle('🔴 Gatewood RP — OFFLINE')
      .setDescription(
        'The city is not responding right now.\n\n' +
        'This is normal during a scheduled restart. If it stays down for more than a few minutes, check the announcements channel.',
      )
      .addFields({ name: 'Last checked', value: ts(Date.now()), inline: true });
  }

  const pct = status.max ? Math.round((status.players / status.max) * 100) : 0;
  const queueNote = status.players >= status.max ? '  ·  **queue active**' : '';
  const ping = averagePing(status.list);

  const embed = E.base(E.COLORS.success)
    .setTitle('🟢 Gatewood RP — ONLINE')
    .setDescription(
      `${bar(status.players, status.max)}  **${status.players}/${status.max}** (${pct}%)${queueNote}`,
    )
    .addFields(
      { name: 'Players', value: `**${status.players}** in the city`, inline: true },
      { name: 'Slots', value: `${status.max}`, inline: true },
      { name: 'Avg. ping', value: ping ? `${ping} ms` : '—', inline: true },
    );

  if (status.resources) embed.addFields({ name: 'Resources', value: `${status.resources}`, inline: true });
  if (config.server.cfxCode) {
    embed.addFields({ name: 'Connect', value: `[cfx.re/join/${config.server.cfxCode}](https://cfx.re/join/${config.server.cfxCode})`, inline: true });
  } else if (config.connectUrl) {
    embed.addFields({ name: 'Connect', value: `\`${config.connectUrl}\``, inline: true });
  }
  embed.addFields({ name: 'Updated', value: ts(Date.now()), inline: true });

  if (status.banner) embed.setImage(status.banner);
  return embed;
}

// ── Status loop ──────────────────────────────────────────────────────────────
// Keeps ONE message in #server-status permanently up to date (rather than
// spamming a new embed every minute) and mirrors the player count into the
// bot's presence, which is what makes a server look busy in the member list.
let timer = null;
let lastOnline = null;

async function refresh(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    const status = await query();
    setPresence(client, status);
    await announceStateChange(guild, status);

    const channel = await channelByKey(guild, 'status');
    if (!channel?.isTextBased()) return;

    const embed = statusEmbed(status);
    const savedId = db.get('statusMessageId');
    const savedChannel = db.get('statusChannelId');

    if (savedId && savedChannel === channel.id) {
      const msg = await channel.messages.fetch(savedId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] }).catch(() => {});
        return;
      }
    }
    const sent = await channel.send({ embeds: [embed] }).catch(() => null);
    if (sent) {
      db.set('statusMessageId', sent.id);
      db.set('statusChannelId', channel.id);
    }
  } catch (err) {
    console.error('[fivem] refresh failed:', err.message);
  }
}

function setPresence(client, status) {
  try {
    if (status.disabled) return;
    if (status.online) {
      client.user.setPresence({
        status: 'online',
        activities: [{ name: `${status.players}/${status.max} in Gatewood`, type: 3 /* Watching */ }],
      });
    } else {
      client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'the city restart…', type: 3 }],
      });
    }
  } catch { /* presence is cosmetic */ }
}

/** Post to #server-logs when the server flips up or down — not every tick. */
async function announceStateChange(guild, status) {
  if (status.disabled) return;
  if (lastOnline === null) { lastOnline = status.online; return; }
  if (lastOnline === status.online) return;
  lastOnline = status.online;

  const embed = status.online
    ? E.success('Server is back online', `${status.players}/${status.max} connected.`)
    : E.error('Server went offline', 'The FXServer stopped responding to status queries.');
  const { logTo } = require('./utils/helpers');
  await logTo(guild, 'server_logs', embed);
}

function start(client, intervalMs = 60_000) {
  if (!config.server.enabled) {
    console.log('[fivem] server query disabled (SERVER_QUERY_ENABLED=false).');
    return;
  }
  stop();
  refresh(client);
  timer = setInterval(() => refresh(client), intervalMs);
  console.log(`[fivem] status loop started — ${BASE()} every ${intervalMs / 1000}s.`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { query, statusEmbed, averagePing, start, stop, refresh, stripColors };
