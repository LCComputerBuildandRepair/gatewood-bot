'use strict';
/**
 * Background timers: live stat counters, restart countdowns and giveaway draws.
 *
 * Discord rate-limits channel renames hard (roughly two per ten minutes per
 * channel), so the stat counters deliberately tick every ten minutes. Do not
 * shorten that interval — the names silently stop updating if you do.
 */
const config = require('./config');
const db = require('./database');
const E = require('./utils/embeds');
const fivem = require('./fivem');
const { STAT_CHANNELS } = require('./structure');
const { channelByKey, roleMention, shuffle, ts } = require('./utils/helpers');

const timers = [];

// ── Live stat counters ───────────────────────────────────────────────────────
async function tickStats(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;

  let status = { online: false, players: 0, max: config.server.maxSlots };
  if (config.server.enabled) status = await fivem.query();

  const values = {
    members: guild.memberCount,
    players: status.online ? `${status.players}/${status.max}` : '—',
    status: status.disabled ? 'n/a' : (status.online ? 'Online' : 'Offline'),
  };

  for (const def of STAT_CHANNELS) {
    const id = db.channelId(def.key);
    if (!id) continue;
    const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (!ch) continue;
    const name = def.template.replace('{n}', values[def.source]);
    if (ch.name !== name) await ch.setName(name).catch(() => {});
  }
}

// ── Restart countdown ────────────────────────────────────────────────────────
// db.restarts holds "HH:MM" strings in the bot host's local time. We announce at
// 15, 5 and 1 minutes out, then once on the hour. `announced` de-dupes within
// the same minute so a 30s tick doesn't double-post.
const announced = new Set();

async function tickRestarts(client) {
  const schedule = db.getRestarts();
  if (!schedule.length) return;

  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (const entry of schedule) {
    const [h, m] = entry.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    let target = h * 60 + m;
    if (target < nowMins) target += 24 * 60; // wraps past midnight
    const away = target - nowMins;

    if (![15, 5, 1, 0].includes(away)) continue;
    const tag = `${entry}:${away}:${now.getHours()}${now.getMinutes()}`;
    if (announced.has(tag)) continue;
    announced.add(tag);
    if (announced.size > 200) announced.clear();

    const ch = await channelByKey(guild, 'announce');
    if (!ch?.isTextBased()) continue;

    const embed = away === 0
      ? E.base(E.COLORS.error).setTitle('🔄 Server restarting now')
        .setDescription('The city is restarting. Reconnect in about two minutes — your character is saved.')
      : E.base(E.COLORS.warn).setTitle(`⏳ Restart in ${away} minute${away === 1 ? '' : 's'}`)
        .setDescription(
          away >= 15
            ? 'Wrap up your scenes. Anything in a vehicle boot or on the ground may not survive.'
            : 'Get somewhere safe and stop any active scenes now.',
        );

    await ch.send({ content: roleMention('p_restart') || undefined, embeds: [embed] }).catch(() => {});
  }
}

// ── Giveaways ────────────────────────────────────────────────────────────────
async function tickGiveaways(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;

  for (const g of db.activeGiveaways()) {
    if (g.endsAt > Date.now()) continue;
    await endGiveaway(guild, g.id).catch(() => {});
  }
}

/** Draw winners, edit the original message and announce. Exported for /giveaway end. */
async function endGiveaway(guild, msgId) {
  const g = db.getGiveaway(msgId);
  if (!g || g.ended) return null;

  const channel = guild.channels.cache.get(g.channelId) || await guild.channels.fetch(g.channelId).catch(() => null);
  const msg = channel?.isTextBased() ? await channel.messages.fetch(msgId).catch(() => null) : null;

  const entries = g.entries || [];
  const winners = shuffle(entries).slice(0, g.winners || 1);

  db.setGiveaway(msgId, { ...g, ended: true, winnerIds: winners });

  const embed = E.base(E.COLORS.brand)
    .setTitle(`🎁 ${g.prize}`)
    .setDescription(
      winners.length
        ? `**Winner${winners.length > 1 ? 's' : ''}:** ${winners.map((id) => `<@${id}>`).join(', ')}\n\n` +
          `Entries: **${entries.length}** • Ended ${ts(Date.now())}`
        : `Nobody entered. No winner drawn.\n\nEnded ${ts(Date.now())}`,
    )
    .setFooter({ text: 'Giveaway ended', iconURL: E.getBrandIcon() || undefined });

  if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  if (channel?.isTextBased() && winners.length) {
    await channel.send({
      content: `🎉 ${winners.map((id) => `<@${id}>`).join(' ')} — you won **${g.prize}**! Open a ticket to claim it.`,
    }).catch(() => {});
  }
  return winners;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
function start(client) {
  const add = (fn, ms, label) => {
    const wrapped = async () => {
      try { await fn(client); } catch (err) { console.error(`[tasks:${label}]`, err.message); }
    };
    wrapped();
    timers.push(setInterval(wrapped, ms));
  };

  add(tickStats, 10 * 60_000, 'stats');
  add(tickRestarts, 30_000, 'restarts');
  add(tickGiveaways, 15_000, 'giveaways');
  console.log('[tasks] stat counters, restart countdown and giveaway timers started.');
}

function stop() {
  while (timers.length) clearInterval(timers.pop());
}

module.exports = { start, stop, endGiveaway, tickStats };
