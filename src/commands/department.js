'use strict';
/**
 * /department — hire, promote, demote and fire, with a live roster.
 *
 * Rank changes always leave exactly one rank role on the member plus the
 * department's flag role, so the member list stays readable and nobody ends up
 * showing as both a Cadet and a Captain.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const { DEPARTMENTS, DEPARTMENT_RANKS } = require('../structure');
const { isStaff, hasRole, channelByKey, logTo, clamp, ts } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

const deptChoices = DEPARTMENTS.map((d) => ({ name: `${d.emoji} ${d.name}`, value: d.key }));
const deptByKey = (key) => DEPARTMENTS.find((d) => d.key === key);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('department')
    .setDescription('Manage a city department’s roster.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('hire').setDescription('Hire someone into a department at a given rank.')
      .addStringOption((o) => o.setName('department').setDescription('Which department').setRequired(true).addChoices(...deptChoices))
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('rank').setDescription('Starting rank').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('rank').setDescription('Change someone’s rank (promotion or demotion).')
      .addStringOption((o) => o.setName('department').setDescription('Which department').setRequired(true).addChoices(...deptChoices))
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('rank').setDescription('New rank').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('fire').setDescription('Remove someone from a department entirely.')
      .addStringOption((o) => o.setName('department').setDescription('Which department').setRequired(true).addChoices(...deptChoices))
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('roster').setDescription('Post the current roster for a department.')
      .addStringOption((o) => o.setName('department').setDescription('Which department').setRequired(true).addChoices(...deptChoices))
      .addBooleanOption((o) => o.setName('publish').setDescription('Post it to the department’s roster channel'))),

  async autocomplete(interaction) {
    const deptKey = interaction.options.getString('department');
    const ranks = DEPARTMENT_RANKS[deptKey] || [];
    const focused = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      ranks
        .filter((r) => r.name.toLowerCase().includes(focused) || r.key.includes(focused))
        .map((r) => ({ name: `${r.emoji} ${r.name}`, value: r.key }))
        .slice(0, 25),
    );
  },

  async execute(interaction) {
    const deptKey = interaction.options.getString('department');
    const dept = deptByKey(deptKey);
    if (!dept) return interaction.reply({ embeds: [E.error('Unknown department', 'Pick one from the list.')], flags: EPH });

    const sub = interaction.options.getSubcommand();
    if (sub === 'roster') return roster(interaction, dept);

    // Command staff of the department, or server staff, can change the roster.
    const commandKeys = (DEPARTMENT_RANKS[deptKey] || [])
      .filter((r) => r.command).map((r) => `dept_${deptKey}_${r.key}`);
    if (!isStaff(interaction.member) && !hasRole(interaction.member, commandKeys)) {
      return interaction.reply({
        embeds: [E.error('Not authorised', `Only **${dept.short} command staff** or server staff can change this roster.`)],
        flags: EPH,
      });
    }

    if (sub === 'hire') return setRank(interaction, dept, 'hire');
    if (sub === 'rank') return setRank(interaction, dept, 'rank');
    if (sub === 'fire') return fire(interaction, dept);
  },
};

async function setRank(interaction, dept, mode) {
  await interaction.deferReply({ flags: EPH });

  const user = interaction.options.getUser('member');
  const rankKey = interaction.options.getString('rank');
  const reason = interaction.options.getString('reason') || '';
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply({ embeds: [E.error('Not here', 'That member is not in the server.')] });

  const ranks = DEPARTMENT_RANKS[dept.key] || [];
  const rank = ranks.find((r) => r.key === rankKey);
  if (!rank) return interaction.editReply({ embeds: [E.error('Unknown rank', 'Pick a rank from the autocomplete list.')] });

  const newRoleId = db.roleId(`dept_${dept.key}_${rank.key}`);
  if (!newRoleId) {
    return interaction.editReply({ embeds: [E.error('Rank role missing', `Run \`/build-departments department:${dept.key}\` first.`)] });
  }

  // Work out what they held before, for the log line.
  const previous = ranks.find((r) => {
    const id = db.roleId(`dept_${dept.key}_${r.key}`);
    return id && member.roles.cache.has(id);
  });

  // Strip every other rank in this department, then apply the new one.
  for (const r of ranks) {
    const id = db.roleId(`dept_${dept.key}_${r.key}`);
    if (id && id !== newRoleId && member.roles.cache.has(id)) {
      await member.roles.remove(id, 'Department rank change').catch(() => {});
    }
  }
  await member.roles.add(newRoleId, `Department rank: ${rank.name}`).catch(() => {});

  const flagId = dept.roleKey ? db.roleId(dept.roleKey) : null;
  if (flagId && !member.roles.cache.has(flagId)) {
    await member.roles.add(flagId, 'Department member').catch(() => {});
  }

  const direction = !previous ? 'hired'
    : ranks.indexOf(rank) < ranks.indexOf(previous) ? 'promoted' : 'demoted';
  const verbs = { hired: '🎉 Hired', promoted: '📈 Promoted', demoted: '📉 Demoted' };

  await member.send({
    embeds: [E.base(dept.color)
      .setTitle(`${verbs[direction]} — ${dept.name}`)
      .setDescription(
        `You are now **${rank.emoji} ${rank.name}**${previous ? ` (was ${previous.name})` : ''}.` +
        (reason ? `\n\n**Note:** ${clamp(reason, 800)}` : ''),
      )],
  }).catch(() => {});

  // Announce in the department's promotions channel.
  const promoId = db.channelId(`dept_${dept.key}_promotions`);
  if (promoId) {
    const ch = interaction.guild.channels.cache.get(promoId);
    await ch?.send({
      embeds: [E.base(dept.color)
        .setTitle(`${verbs[direction]} — ${dept.short}`)
        .setDescription(
          `<@${member.id}> → **${rank.emoji} ${rank.name}**${previous ? `\nPrevious rank: ${previous.name}` : ''}\n` +
          `By <@${interaction.user.id}> ${ts(Date.now())}` +
          (reason ? `\n**Reason:** ${clamp(reason, 800)}` : ''),
        )],
    }).catch(() => {});
  }

  await logTo(interaction.guild, 'mod_logs', E.base(dept.color)
    .setTitle(`${verbs[direction]} — ${dept.short}`)
    .setDescription(`<@${member.id}> → **${rank.name}** by <@${interaction.user.id}>`));

  return interaction.editReply({
    embeds: [E.success(mode === 'hire' ? 'Hired' : 'Rank updated', `<@${member.id}> is now **${rank.emoji} ${rank.name}** in ${dept.short}.`)],
  });
}

async function fire(interaction, dept) {
  await interaction.deferReply({ flags: EPH });

  const user = interaction.options.getUser('member');
  const reason = interaction.options.getString('reason') || 'No reason given';
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply({ embeds: [E.error('Not here', 'That member is not in the server.')] });

  let removed = 0;
  for (const r of DEPARTMENT_RANKS[dept.key] || []) {
    const id = db.roleId(`dept_${dept.key}_${r.key}`);
    if (id && member.roles.cache.has(id)) {
      await member.roles.remove(id, `Removed from ${dept.short}: ${reason}`).catch(() => {});
      removed += 1;
    }
  }
  const flagId = dept.roleKey ? db.roleId(dept.roleKey) : null;
  if (flagId && member.roles.cache.has(flagId)) {
    await member.roles.remove(flagId, `Removed from ${dept.short}`).catch(() => {});
    removed += 1;
  }

  if (!removed) return interaction.editReply({ embeds: [E.warn('Nothing to do', `<@${member.id}> was not in ${dept.short}.`)] });

  await member.send({
    embeds: [E.error(`Removed from ${dept.name}`, `**Reason:** ${clamp(reason, 900)}\n\nSpeak to command staff if you believe this is a mistake.`)],
  }).catch(() => {});

  await logTo(interaction.guild, 'mod_logs', E.base(E.COLORS.error)
    .setTitle(`🚫 Removed from ${dept.short}`)
    .setDescription(`<@${member.id}> by <@${interaction.user.id}>\n**Reason:** ${clamp(reason, 900)}`));

  return interaction.editReply({ embeds: [E.success('Removed', `<@${member.id}> is no longer in ${dept.short}.`)] });
}

async function roster(interaction, dept) {
  await interaction.deferReply({ flags: EPH });
  await interaction.guild.members.fetch().catch(() => {});

  const ranks = DEPARTMENT_RANKS[dept.key] || [];
  const embed = E.base(dept.color)
    .setTitle(`${dept.emoji} ${dept.name} — Roster`)
    .setDescription(`Updated ${ts(Date.now())}`);

  let total = 0;
  for (const rank of ranks) {
    const id = db.roleId(`dept_${dept.key}_${rank.key}`);
    if (!id) continue;
    const members = interaction.guild.members.cache.filter((m) => m.roles.cache.has(id));
    total += members.size;
    embed.addFields({
      name: `${rank.emoji} ${rank.name} — ${members.size}`,
      value: clamp(members.map((m) => `<@${m.id}>`).join(' ') || '*vacant*', 1000),
    });
  }
  embed.setFooter({ text: `${total} personnel`, iconURL: E.getBrandIcon() || undefined });

  if (interaction.options.getBoolean('publish')) {
    const rosterId = db.channelId(`dept_${dept.key}_roster`);
    const ch = rosterId ? interaction.guild.channels.cache.get(rosterId) : null;
    if (ch?.isTextBased()) {
      // Keep one living roster message rather than a wall of stale ones.
      const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
      const mine = recent?.find((m) => m.author.id === interaction.client.user.id);
      if (mine) await mine.edit({ embeds: [embed] }).catch(() => {});
      else await ch.send({ embeds: [embed] }).catch(() => {});
      return interaction.editReply({ embeds: [E.success('Roster published', `Posted to <#${ch.id}>.`)] });
    }
    return interaction.editReply({ embeds: [E.warn('No roster channel', 'Run `/build-departments` first.'), embed] });
  }

  return interaction.editReply({ embeds: [embed] });
}
