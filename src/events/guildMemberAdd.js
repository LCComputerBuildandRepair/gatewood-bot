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
    // Two join modes, switched with `/config toggle feature:autoJoinRoles`:
    //
    //   auto   — the doors are open. New members get Citizen + Whitelisted
    //            immediately, so a young server never loses people at a gate.
    //   verify — they land as Unverified and the server stays hidden until they
    //            accept the rules. Flip to this once you want the gate back.
    const autoJoin = db.get('autoJoinRoles', false);
    let grantedAuto = false;

    if (autoJoin) {
      const roles = [db.roleId('member'), db.roleId('whitelist')].filter(Boolean);
      if (roles.length) {
        await member.roles.add(roles, 'Auto-granted on join (open server)').catch(() => {});
        grantedAuto = true;
      }
    } else {
      const unverified = db.roleId('unverified');
      if (unverified) await member.roles.add(unverified, 'Joined the server').catch(() => {});
    }

    const age = Date.now() - member.user.createdTimestamp;
    const suspicious = age < NEW_ACCOUNT_MS;

    await logTo(member.guild, 'member_logs', E.base(suspicious ? E.COLORS.warn : E.COLORS.success)
      .setTitle('🚪 Member joined')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Member', value: `<@${member.id}>\n\`${member.user.tag}\``, inline: true },
        { name: 'Account created', value: ts(member.user.createdTimestamp), inline: true },
        { name: 'Member count', value: String(member.guild.memberCount), inline: true },
        { name: 'Access', value: grantedAuto ? 'Auto-granted Citizen + Whitelisted' : 'Unverified — must accept the rules', inline: true },
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
          (grantedAuto
            ? `You are already in — no application needed. Read the rulebook in ${channelMention('rules') || '#rules'} (it still applies to you), grab your roles in ${channelMention('roles') || '#get-roles'}, then head to ${channelMention('connect') || '#how-to-connect'} and we will see you in the city.`
            : `Read the rulebook in ${channelMention('rules') || '#rules'}, then verify in ${channelMention('verify') || '#verify'} to unlock the rest of the server.`),
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))],
    }).catch(() => {});
  },
};
