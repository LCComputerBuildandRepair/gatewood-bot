'use strict';
/**
 * Per-message work: automod, activity XP, suggestion voting, and the
 * Discord → in-game chat relay.
 */
const db = require('../database');
const E = require('../utils/embeds');
const automod = require('../automod');
const bridge = require('../bridge');
const { LEVEL_ROLES } = require('../structure');
const { channelByKey } = require('../utils/helpers');

// userId → timestamp of last XP award (Mee6-style 60-second cooldown).
const xpCooldown = new Map();
const XP_COOLDOWN_MS = 60_000;

/** Mee6 curve: total XP required to reach a level. */
const xpForLevel = (level) => (5 / 6) * level * (2 * level * level + 27 * level + 91);

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    if (await automod.inspect(message)) return;

    await relayToGame(message);
    await handleSuggestion(message);
    await awardXp(message);
  },
};

// ── Discord → in-game chat ───────────────────────────────────────────────────
async function relayToGame(message) {
  const relayId = db.channelId('ingame_chat');
  if (!relayId || message.channel.id !== relayId) return;
  bridge.pushToGame(message.member?.displayName || message.author.username, message.content.slice(0, 200));
}

// ── Suggestions ──────────────────────────────────────────────────────────────
// Anything posted in #suggestions gets vote reactions and a discussion thread,
// so ideas don't drown the channel.
async function handleSuggestion(message) {
  const id = db.channelId('suggest');
  if (!id || message.channel.id !== id) return;
  if (message.content.length < 10) {
    const warn = await message.reply({ embeds: [E.warn('Too short', 'Give us a real sentence — what do you want, and why?')] }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 10_000);
    return;
  }

  await message.react('⬆️').catch(() => {});
  await message.react('⬇️').catch(() => {});
  await message.startThread({
    name: `💡 ${message.content.slice(0, 60)}`,
    autoArchiveDuration: 1440,
  }).catch(() => {});

  db.setSuggestion(message.id, { userId: message.author.id, text: message.content.slice(0, 500), status: 'open' });
}

// ── Activity XP ──────────────────────────────────────────────────────────────
async function awardXp(message) {
  if (!db.get('levelingEnabled', true)) return;

  const now = Date.now();
  const last = xpCooldown.get(message.author.id) || 0;
  if (now - last < XP_COOLDOWN_MS) return;
  xpCooldown.set(message.author.id, now);

  const current = db.getLevel(message.author.id);
  const gained = 15 + Math.floor(Math.random() * 11); // 15–25
  const xp = current.xp + gained;

  let level = current.level;
  while (xp >= xpForLevel(level + 1)) level += 1;

  db.setLevel(message.author.id, { xp, level, msgs: (current.msgs || 0) + 1 });

  if (level > current.level) {
    await syncLevelRole(message.member, level);
    const channel = (await channelByKey(message.guild, 'bots')) || message.channel;
    await channel.send({
      embeds: [E.base(E.COLORS.brand)
        .setTitle('📈 Level up')
        .setDescription(`<@${message.author.id}> reached **level ${level}**.`)],
    }).catch(() => {});
  }
}

/** Keep only the highest earned level role on a member. */
async function syncLevelRole(member, level) {
  if (!member) return;
  const earned = LEVEL_ROLES.filter((r) => level >= r.level);
  if (!earned.length) return;
  const top = earned[earned.length - 1];

  for (const def of LEVEL_ROLES) {
    const id = db.roleId(def.key);
    if (!id) continue;
    const shouldHave = def.key === top.key;
    const has = member.roles.cache.has(id);
    if (shouldHave && !has) await member.roles.add(id, 'Level reward').catch(() => {});
    if (!shouldHave && has) await member.roles.remove(id, 'Superseded level reward').catch(() => {});
  }
}

module.exports.syncLevelRole = syncLevelRole;
module.exports.xpForLevel = xpForLevel;
