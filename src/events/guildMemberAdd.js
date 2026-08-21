'use strict';
const db = require('../database');
const E = require('../utils/embeds');
const { channelByKey, logTo, ts, channelMention } = require('../utils/helpers');

// Accounts younger than this get flagged in member-logs — the single most
// useful signal for spotting a raid or a ban-evading alt.
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    // Everyone starts Unverified so the server stays hidden until they accept
    // the rules. Verifying swaps this for Citizen.
    const unverified = db.roleId('unverified');
    if (unverified) await member.roles.add(unverified, 'Joined the server').catch(() => {});

    const age = Date.now() - member.user.createdTimestamp;
    const suspicious = age < NEW_ACCOUNT_MS;

    await logTo(member.guild, 'member_logs', E.base(suspicious ? E.COLORS.warn : E.COLORS.success)
      .setTitle('🚪 Member joined')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Member', value: `<@${member.id}>\n\`${member.user.tag}\``, inline: true },
        { name: 'Account created', value: ts(member.user.createdTimestamp), inline: true },
        { name: 'Member count', value: String(member.guild.memberCount), inline: true },
        ...(suspicious ? [{ name: '⚠️ Flag', value: 'Account is less than 7 days old.' }] : []),
      ));

    if (!db.get('welcomeEnabled', true)) return;

    const channel = await channelByKey(member.guild, 'welcome');
    if (!channel?.isTextBased()) return;

    await channel.send({
      content: `<@${member.id}>`,
      embeds: [E.base(E.COLORS.brand)
        .setTitle(`Welcome to ${member.guild.name}`)
        .setDescription(
          `You are member **#${member.guild.memberCount}**.\n\n` +
          `Read the rulebook in ${channelMention('rules') || '#rules'}, then verify in ${channelMention('verify') || '#verify'} to unlock the rest of the server.`,
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))],
    }).catch(() => {});
  },
};
