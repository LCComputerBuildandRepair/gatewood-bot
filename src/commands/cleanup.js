'use strict';
/**
 * /cleanup — destructive tidy-up tools, all gated behind typing CONFIRM.
 *
 * Use these when converting an existing Discord over to the blueprint: build
 * the new structure with /setup first, check it, then clear out what's left.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const { CATEGORIES, STAT_CATEGORY, DEPARTMENTS } = require('../structure');
const { TICKET_TYPES } = require('../tickets');
const { clamp } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Remove leftover channels, roles or unverified members. Destructive.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName('target').setDescription('What to clean up').setRequired(true).addChoices(
      { name: 'channels — delete every channel the bot did not create', value: 'channels' },
      { name: 'roles — delete every role not in the blueprint', value: 'roles' },
      { name: 'members — give every human the Citizen role', value: 'members' },
      { name: 'preview — show what would be removed, delete nothing', value: 'preview' },
    ))
    .addStringOption((o) => o.setName('confirm').setDescription('Type CONFIRM to actually do it')),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [E.error('Admins only', 'This one is Administrator-gated for good reason.')], flags: EPH });
    }

    await interaction.deferReply({ flags: EPH });

    const target = interaction.options.getString('target');
    const confirmed = interaction.options.getString('confirm') === 'CONFIRM';
    const guild = interaction.guild;
    await guild.channels.fetch();
    await guild.roles.fetch();

    if (target === 'preview' || !confirmed) {
      const { channels, roles } = computeTargets(guild);
      return interaction.editReply({
        embeds: [E.warn(target === 'preview' ? 'Preview only' : 'Not confirmed',
          `Nothing has been deleted.\n\n` +
          `**Channels that would go (${channels.length}):**\n${clamp(channels.map((c) => `#${c.name}`).join(', ') || 'none', 900)}\n\n` +
          `**Roles that would go (${roles.length}):**\n${clamp(roles.map((r) => r.name).join(', ') || 'none', 900)}\n\n` +
          'Re-run with `confirm:CONFIRM` to go through with it.')],
      });
    }

    if (target === 'channels') return cleanChannels(interaction, guild);
    if (target === 'roles') return cleanRoles(interaction, guild);
    if (target === 'members') return cleanMembers(interaction, guild);
  },
};

/** Everything the bot knows it built, plus blueprint category names — the keep-list. */
function keepSets(guild) {
  const keepChannels = new Set(Object.values(db.allIds('channels')));
  const keepCategories = new Set(Object.values(db.allIds('categories')));
  const keepNames = new Set([
    ...CATEGORIES.map((c) => c.name),
    STAT_CATEGORY.name,
    ...DEPARTMENTS.map((d) => `${d.emoji} ┃ ${d.short}`),
    ...TICKET_TYPES.map((t) => t.categoryName),
  ]);
  // Organisation categories and their children are always kept.
  for (const org of db.listOrgs()) {
    if (org.categoryId) keepCategories.add(org.categoryId);
  }
  return { keepChannels, keepCategories, keepNames };
}

function computeTargets(guild) {
  const { keepChannels, keepCategories, keepNames } = keepSets(guild);
  const orgCategoryIds = new Set(db.listOrgs().map((o) => o.categoryId).filter(Boolean));

  const channels = [...guild.channels.cache.values()].filter((c) => {
    if (keepChannels.has(c.id) || keepCategories.has(c.id)) return false;
    if (keepNames.has(c.name)) return false;
    if (c.parentId && orgCategoryIds.has(c.parentId)) return false;   // org channels
    if (db.getTicket(c.id)) return false;                              // live tickets
    if (db.isTempVc(c.id)) return false;                               // join-to-create rooms
    if (c.id === guild.rulesChannelId || c.id === guild.publicUpdatesChannelId) return false;
    return true;
  });

  const blueprintRoleIds = new Set(Object.values(db.allIds('roles')));
  const orgRoleIds = new Set(db.listOrgs().map((o) => o.roleId).filter(Boolean));
  const botTop = guild.members.me?.roles.highest.position ?? 0;

  const roles = [...guild.roles.cache.values()].filter((r) =>
    r.id !== guild.id
    && !r.managed
    && !blueprintRoleIds.has(r.id)
    && !orgRoleIds.has(r.id)
    && r.position < botTop);

  return { channels, roles };
}

async function cleanChannels(interaction, guild) {
  const { channels } = computeTargets(guild);
  let deleted = 0;
  for (const c of channels) {
    if (await c.delete('Cleanup: not part of the blueprint').then(() => true).catch(() => false)) deleted += 1;
  }
  return interaction.editReply({
    embeds: [E.success('Channels cleaned', `Deleted **${deleted}** of ${channels.length} targeted channels.`)],
  });
}

async function cleanRoles(interaction, guild) {
  const { roles } = computeTargets(guild);
  let deleted = 0;
  const blocked = [];
  for (const r of roles) {
    if (await r.delete('Cleanup: not part of the blueprint').then(() => true).catch(() => false)) deleted += 1;
    else blocked.push(r.name);
  }
  const embed = E.success('Roles cleaned', `Deleted **${deleted}** of ${roles.length} targeted roles.`);
  if (blocked.length) embed.addFields({ name: 'Could not delete', value: clamp(blocked.join(', '), 1000) });
  return interaction.editReply({ embeds: [embed] });
}

async function cleanMembers(interaction, guild) {
  const memberRole = db.roleId('member');
  const unverified = db.roleId('unverified');
  if (!memberRole) return interaction.editReply({ embeds: [E.error('No Citizen role', 'Run `/setup` or bind it with `/config role key:member`.')] });

  await guild.members.fetch();
  let granted = 0;
  for (const m of guild.members.cache.values()) {
    if (m.user.bot || m.roles.cache.has(memberRole)) continue;
    await m.roles.add(memberRole, 'Cleanup: bulk verify').catch(() => {});
    if (unverified && m.roles.cache.has(unverified)) await m.roles.remove(unverified, 'Cleanup: bulk verify').catch(() => {});
    granted += 1;
  }
  return interaction.editReply({ embeds: [E.success('Members verified', `Gave the Citizen role to **${granted}** members.`)] });
}
