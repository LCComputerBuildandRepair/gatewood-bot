'use strict';
/**
 * /userinfo — one place to see everything about a member: roles, join date,
 * warnings, in-game link, priority and duty status. The command staff actually
 * use before making a call.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const { isStaff, ts, clamp, humanMinutes } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Everything the bot knows about a member.')
    .addUserOption((o) => o.setName('member').setDescription('Who (default: you)')),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const user = interaction.options.getUser('member') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const staffView = isStaff(interaction.member);

    const roles = member?.roles.cache
      .filter((r) => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `<@&${r.id}>`)
      .join(' ');

    const level = db.getLevel(user.id);
    const embed = E.base(member?.displayColor || E.COLORS.info)
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Member', value: `<@${user.id}>\n\`${user.id}\``, inline: true },
        { name: 'Account created', value: ts(user.createdTimestamp), inline: true },
        { name: 'Joined server', value: member?.joinedTimestamp ? ts(member.joinedTimestamp) : 'Not in the server', inline: true },
        { name: 'Activity', value: `Level **${level.level}** · ${Math.round(level.xp).toLocaleString()} XP`, inline: true },
      );

    if (member?.premiumSinceTimestamp) {
      embed.addFields({ name: 'Boosting since', value: ts(member.premiumSinceTimestamp), inline: true });
    }
    if (member?.communicationDisabledUntilTimestamp > Date.now()) {
      embed.addFields({ name: '⏳ Timed out until', value: ts(member.communicationDisabledUntilTimestamp), inline: true });
    }

    embed.addFields({ name: `Roles (${member?.roles.cache.size - 1 || 0})`, value: clamp(roles || 'None', 1000) });

    // Staff-only extras.
    if (staffView) {
      const warnings = db.getWarnings(user.id);
      const notes = db.getNotes(user.id);
      const link = db.getLink(user.id);
      const priority = db.getPriority(user.id);
      const shift = db.getShift(user.id);
      const apps = db.userApplications(user.id);

      embed.addFields(
        { name: '— Staff view —', value: '​' },
        { name: 'Warnings', value: warnings.length ? `**${warnings.length}** — latest: ${clamp(warnings[warnings.length - 1].reason, 200)}` : 'None', inline: true },
        { name: 'Staff notes', value: String(notes.length), inline: true },
        { name: 'Applications', value: apps.length ? apps.map((a) => `${a.type}: **${a.status}**`).join('\n') : 'None', inline: true },
        { name: 'In-game link', value: link ? `${link.name || '—'}\n\`${link.license}\`` : 'Not linked', inline: true },
        { name: 'Queue priority', value: priority && (!priority.until || priority.until > Date.now()) ? `${priority.slots} (${priority.tier})` : 'None', inline: true },
        { name: 'Duty', value: shift ? `🟢 On duty since ${ts(shift.since)}` : `🔴 Off · ${humanMinutes(db.shiftTotals(user.id))} logged`, inline: true },
      );
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
