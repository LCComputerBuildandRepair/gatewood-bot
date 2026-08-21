'use strict';
/**
 * Lightweight automod. Deliberately narrow — it catches the three things that
 * actually plague a growing FiveM Discord (advertising, raid spam, mass pings)
 * and leaves everything else to humans. Staff are always exempt.
 *
 * Toggle at runtime with `/config automod on|off`.
 */
const db = require('./database');
const E = require('./utils/embeds');
const { isStaff, logTo, clamp } = require('./utils/helpers');

const INVITE = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|dsc\.gg)\/\s*[\w-]+/i;
const OTHER_SERVER = /\b(fivem|cfx)\.re\/join\/[\w]+/i;
const MASS_MENTION = 6;

// userId → [timestamps] of recent messages, for the spam window.
const recent = new Map();
const SPAM_WINDOW_MS = 7000;
const SPAM_LIMIT = 6;

function trackSpam(userId) {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter((t) => now - t < SPAM_WINDOW_MS);
  list.push(now);
  recent.set(userId, list);
  return list.length;
}

/**
 * Inspect a message. Returns true if it was actioned (deleted), so the caller
 * knows to skip XP and other per-message work.
 */
async function inspect(message) {
  if (!db.get('automod', true)) return false;
  if (!message.guild || message.author.bot) return false;
  if (isStaff(message.member)) return false;

  const content = message.content || '';
  let reason = null;

  if (INVITE.test(content)) reason = 'Discord invite link';
  else if (OTHER_SERVER.test(content)) reason = 'Link to another FiveM server';
  else if (message.mentions.users.size + message.mentions.roles.size >= MASS_MENTION) reason = 'Mass mention';
  else if (trackSpam(message.author.id) > SPAM_LIMIT) reason = 'Message spam';

  if (!reason) return false;

  await message.delete().catch(() => {});

  const warned = await message.channel.send({
    content: `<@${message.author.id}>`,
    embeds: [E.warn('Message removed', `**${reason}.** Advertising and spam are not allowed here.`)],
  }).catch(() => null);
  if (warned) setTimeout(() => warned.delete().catch(() => {}), 8000);

  if (reason === 'Message spam') {
    await message.member.timeout(5 * 60_000, 'Automod: spam').catch(() => {});
  }

  await logTo(message.guild, 'mod_logs', E.base(E.COLORS.warn)
    .setTitle('🤖 Automod')
    .addFields(
      { name: 'User', value: `<@${message.author.id}> (\`${message.author.id}\`)`, inline: true },
      { name: 'Rule', value: reason, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Content', value: clamp(content || '*(empty)*', 1000) },
    ));

  return true;
}

module.exports = { inspect };
