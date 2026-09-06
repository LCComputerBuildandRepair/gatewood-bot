'use strict';
/**
 * /build-departments — give every department its own private wing of the server.
 *
 * For each department in structure.js this creates:
 *   • a full rank ladder of roles (`dept_<dept>_<rank>`)
 *   • a locked category
 *   • the standard channel set, permissioned by scope (all / announce / command)
 *
 * Idempotent: existing roles and channels are reused, and a rank that has been
 * renamed in the blueprint is renamed in place rather than duplicated.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const {
  DEPARTMENTS, DEPARTMENT_RANKS, DEPARTMENT_CHANNELS, DEPARTMENT_EXTRA_CHANNELS, STAFF_KEYS,
} = require('../structure');
const { dedupeOverwrites } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;
const P = PermissionFlagsBits;

const VIEW = [P.ViewChannel, P.ReadMessageHistory];
const POST = [P.SendMessages, P.SendMessagesInThreads, P.AttachFiles, P.EmbedLinks, P.AddReactions];
const VOICE = [P.Connect, P.Speak];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('build-departments')
    .setDescription('Create the roles, categories and channels for every city department.')
    .addStringOption((o) => o.setName('department')
      .setDescription('Build just one department (default: all)')
      .addChoices(...DEPARTMENTS.map((d) => ({ name: `${d.emoji} ${d.name}`, value: d.key }))))
    .setDefaultMemberPermissions(P.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(P.Administrator)) {
      return interaction.reply({ embeds: [E.error('Admins only', 'You need Administrator for this.')], flags: EPH });
    }

    const only = interaction.options.getString('department');
    const targets = only ? DEPARTMENTS.filter((d) => d.key === only) : DEPARTMENTS;

    await interaction.reply({
      embeds: [E.info('🏛️ Building departments…',
        `Creating ${targets.length} department${targets.length === 1 ? '' : 's'} — roles, categories and channels.\n\n` +
        'All departments at once is roughly 40 roles and 90 channels, so give it a couple of minutes.')],
      flags: EPH,
    });

    const log = [];
    try {
      await interaction.guild.roles.fetch();
      await interaction.guild.channels.fetch();

      for (const dept of targets) {
        await buildDepartment(interaction.guild, dept, log);
      }

      const shown = log.slice(0, 35).join('\n') || 'Everything was already in place.';
      const more = log.length > 35 ? `\n\n…and ${log.length - 35} more.` : '';
      await interaction.editReply({
        embeds: [E.success('Departments ready', shown + more)
          .setFooter({ text: `${log.length} actions • run /organize to tidy the category order`, iconURL: E.getBrandIcon() || undefined })],
      });
    } catch (err) {
      console.error('[build-departments] failed:', err);
      await interaction.editReply({ embeds: [E.error('Build failed', `\`${err.message}\``)] });
    }
  },
};

async function buildDepartment(guild, dept, log) {
  const ranks = DEPARTMENT_RANKS[dept.key] || [];

  // ── Rank roles ──
  const rankIds = [];
  const commandIds = [];

  for (const rank of ranks) {
    const key = `dept_${dept.key}_${rank.key}`;
    const roleName = `${rank.emoji} ${dept.short} ${rank.name}`;
    let role = null;

    const storedId = db.roleId(key);
    if (storedId) role = guild.roles.cache.get(storedId) || null;
    if (!role) role = guild.roles.cache.find((r) => r.name === roleName) || null;

    if (!role) {
      role = await guild.roles.create({
        name: roleName, color: rank.color, hoist: false, mentionable: true,
        reason: `${dept.name} rank ladder`,
      });
      log.push(`➕ ${roleName}`);
    } else if (role.name !== roleName) {
      // Blueprint rename: keep the role (and everyone in it), change the name.
      await role.edit({ name: roleName, color: rank.color }).catch(() => {});
      log.push(`✏️ Renamed → ${roleName}`);
    }

    db.setId('roles', key, role.id);
    rankIds.push(role.id);
    if (rank.command) commandIds.push(role.id);
  }

  // The department-wide flag role from ROLES (e.g. "🚓 Los Santos Police").
  const flagId = dept.roleKey ? db.roleId(dept.roleKey) : null;
  const memberIds = [...rankIds, ...(flagId ? [flagId] : [])];
  const staffIds = STAFF_KEYS.map((k) => db.roleId(k)).filter(Boolean);

  // ── Category ──
  const categoryName = `${dept.emoji} ┃ ${dept.short}`;
  const catKey = `dept_cat_${dept.key}`;
  let category = null;
  const storedCat = db.getId('categories', catKey);
  if (storedCat) category = guild.channels.cache.get(storedCat) || null;
  if (!category) {
    category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categoryName,
    ) || null;
  }

  const categoryOverwrites = buildOverwrites(guild, 'all', memberIds, commandIds, staffIds, false);
  if (!category) {
    category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: categoryOverwrites,
      reason: `${dept.name} category`,
    });
    log.push(`📁 ${categoryName}`);
  } else {
    // Re-apply the lock in case roles were added since the last run.
    await category.permissionOverwrites.set(categoryOverwrites, 'Re-applying department lock').catch(() => {});
  }
  db.setId('categories', catKey, category.id);

  // ── Channels ──
  // Core set plus anything this particular department genuinely needs.
  const channelSet = [...DEPARTMENT_CHANNELS, ...(DEPARTMENT_EXTRA_CHANNELS[dept.key] || [])];

  for (const def of channelSet) {
    const name = def.name.replace('{slug}', dept.slug);
    const key = `dept_${dept.key}_${def.key}`;
    const isVoice = def.type === 'voice';

    let channel = null;
    const stored = db.channelId(key);
    if (stored) channel = guild.channels.cache.get(stored) || null;
    if (!channel) {
      channel = guild.channels.cache.find((c) => c.parentId === category.id && c.name === name) || null;
    }

    const overwrites = buildOverwrites(guild, def.scope, memberIds, commandIds, staffIds, isVoice);
    if (!channel) {
      channel = await guild.channels.create({
        name,
        type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites,
        reason: `${dept.name} channel`,
      });
      log.push(`#️⃣ ${dept.short} · ${name}`);
    } else {
      await channel.permissionOverwrites.set(overwrites, 'Re-applying department lock').catch(() => {});
    }
    db.setId('channels', key, channel.id);
  }
}

/**
 * scope 'all'      → every rank can view and post
 * scope 'announce' → every rank can view, only command ranks post
 * scope 'command'  → command ranks only
 */
function buildOverwrites(guild, scope, memberIds, commandIds, staffIds, isVoice) {
  const ow = [{ id: guild.roles.everyone.id, deny: [P.ViewChannel] }];
  const speak = isVoice ? VOICE : [];
  const commandSet = new Set(commandIds);

  // Discord rejects a payload with two overwrites for the same role, and
  // command ranks are also in memberIds — so each id is emitted exactly once,
  // command ranks taking the more permissive entry.
  if (scope !== 'command') {
    const canPost = scope !== 'announce';
    for (const id of memberIds) {
      if (commandSet.has(id)) continue;
      ow.push({
        id,
        allow: [...VIEW, ...(canPost ? [...POST, ...speak] : (isVoice ? [P.Connect] : []))],
        deny: canPost ? [] : [P.SendMessages, P.SendMessagesInThreads, ...(isVoice ? [P.Speak] : [])],
      });
    }
  }
  // Command ranks always view and post, in every scope.
  for (const id of commandIds) ow.push({ id, allow: [...VIEW, ...POST, ...speak] });

  for (const id of staffIds) {
    if (commandSet.has(id)) continue;
    ow.push({ id, allow: [...VIEW, ...POST, ...speak, P.ManageMessages] });
  }
  return dedupeOverwrites(ow);
}
