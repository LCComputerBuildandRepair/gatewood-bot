'use strict';
/**
 * /org — gangs, MCs and businesses.
 *
 * Creating one gives the organisation its own role and a private category
 * (chat + planning + voice), which is what turns an approved application into
 * something that actually feels like a faction inside the city.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const { STAFF_KEYS } = require('../structure');
const { isStaff, channelByKey, dedupeOverwrites, slugify, clamp, ts } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;
const P = PermissionFlagsBits;

const TYPES = [
  { name: '💀 Gang', value: 'gang', color: 0x111827, emoji: '💀', leaderRole: 'gangleader' },
  { name: '🏍️ Motorcycle Club', value: 'mc', color: 0x92400E, emoji: '🏍️', leaderRole: 'gangleader' },
  { name: '💼 Business', value: 'business', color: 0x059669, emoji: '💼', leaderRole: 'bizowner' },
];
const typeByValue = (v) => TYPES.find((t) => t.value === v);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('org')
    .setDescription('Gangs, motorcycle clubs and businesses.')
    .addSubcommand((s) => s.setName('create').setDescription('Register an organisation and build its private area.')
      .addStringOption((o) => o.setName('type').setDescription('What kind').setRequired(true).addChoices(...TYPES.map(({ name, value }) => ({ name, value }))))
      .addStringOption((o) => o.setName('name').setDescription('Organisation name').setRequired(true))
      .addUserOption((o) => o.setName('leader').setDescription('Who runs it').setRequired(true)))
    .addSubcommand((s) => s.setName('add').setDescription('Add a member to an organisation.')
      .addStringOption((o) => o.setName('org').setDescription('Which organisation').setRequired(true).setAutocomplete(true))
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a member from an organisation.')
      .addStringOption((o) => o.setName('org').setDescription('Which organisation').setRequired(true).setAutocomplete(true))
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List every registered organisation.')
      .addStringOption((o) => o.setName('type').setDescription('Filter by type').addChoices(...TYPES.map(({ name, value }) => ({ name, value })))))
    .addSubcommand((s) => s.setName('disband').setDescription('Disband an organisation (deletes its role and category).')
      .addStringOption((o) => o.setName('org').setDescription('Which organisation').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('confirm').setDescription('Type DISBAND to confirm').setRequired(true))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      db.listOrgs()
        .filter((o) => o.name.toLowerCase().includes(focused) || o.key.includes(focused))
        .map((o) => ({ name: `${o.name} (${o.type})`, value: o.key }))
        .slice(0, 25),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return list(interaction);

    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [E.error('Staff only', 'Only staff can register or change organisations.')], flags: EPH });
    }
    if (sub === 'create') return create(interaction);
    if (sub === 'add') return membership(interaction, true);
    if (sub === 'remove') return membership(interaction, false);
    if (sub === 'disband') return disband(interaction);
  },
};

async function create(interaction) {
  await interaction.deferReply({ flags: EPH });

  const type = typeByValue(interaction.options.getString('type'));
  const name = interaction.options.getString('name').slice(0, 60);
  const leaderUser = interaction.options.getUser('leader');
  const key = slugify(name);

  if (db.getOrg(key)) {
    return interaction.editReply({ embeds: [E.error('Already registered', `**${name}** already exists. Pick another name or \`/org disband\` the old one.`)] });
  }

  const guild = interaction.guild;
  const leader = await guild.members.fetch(leaderUser.id).catch(() => null);

  // Role
  const role = await guild.roles.create({
    name: `${type.emoji} ${name}`,
    color: type.color,
    mentionable: true,
    reason: `Organisation registered by ${interaction.user.tag}`,
  });

  // Private category
  const staffIds = STAFF_KEYS.map((k) => db.roleId(k)).filter(Boolean);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: role.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.Connect, P.Speak, P.AttachFiles, P.EmbedLinks] },
    ...staffIds.map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.Connect, P.Speak, P.ManageMessages] })),
  ];

  const category = await guild.channels.create({
    name: `${type.emoji} ┃ ${name.toUpperCase()}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: dedupeOverwrites(overwrites),
    reason: 'Organisation category',
  });

  const channels = type.value === 'business'
    ? [['💬・staff-room', 'text'], ['📋・orders-and-jobs', 'text'], ['📢・announcements', 'text'], ['🔊 Shop Floor', 'voice']]
    : [['💬・chat', 'text'], ['🗺️・planning', 'text'], ['📢・announcements', 'text'], ['🔊 Hangout', 'voice']];

  for (const [chName, chType] of channels) {
    await guild.channels.create({
      name: chName,
      type: chType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
      parent: category.id,
      reason: 'Organisation channel',
    }).catch(() => {});
  }

  // Roles for the leader
  if (leader) {
    await leader.roles.add(role.id, 'Organisation leader').catch(() => {});
    const leaderRoleId = db.roleId(type.leaderRole);
    if (leaderRoleId) await leader.roles.add(leaderRoleId, 'Organisation leader').catch(() => {});
  }

  db.setOrg(key, {
    name, type: type.value, leaderId: leaderUser.id,
    roleId: role.id, categoryId: category.id, createdAt: Date.now(),
  });

  // Publish to the public organisations directory.
  const directory = await channelByKey(guild, type.value === 'business' ? 'ic_business' : 'orgs');
  if (directory?.isTextBased()) {
    await directory.send({
      embeds: [E.base(type.color)
        .setTitle(`${type.emoji} ${name}`)
        .setDescription(`A new **${type.name.replace(/^\S+\s/, '')}** has been registered in Gatewood.`)
        .addFields(
          { name: 'Leader', value: `<@${leaderUser.id}>`, inline: true },
          { name: 'Registered', value: ts(Date.now()), inline: true },
        )],
    }).catch(() => {});
  }

  return interaction.editReply({
    embeds: [E.success('Organisation registered',
      `**${name}** is live.\n\n` +
      `Role: ${role}\nCategory: **${category.name}**\nLeader: <@${leaderUser.id}>\n\n` +
      `Add members with \`/org add org:${key}\`.`)],
  });
}

async function membership(interaction, add) {
  await interaction.deferReply({ flags: EPH });

  const key = interaction.options.getString('org');
  const org = db.getOrg(key);
  if (!org) return interaction.editReply({ embeds: [E.error('Not found', 'No organisation with that key.')] });

  const user = interaction.options.getUser('member');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply({ embeds: [E.error('Not here', 'That member is not in the server.')] });

  if (add) await member.roles.add(org.roleId, `Joined ${org.name}`).catch(() => {});
  else await member.roles.remove(org.roleId, `Left ${org.name}`).catch(() => {});

  return interaction.editReply({
    embeds: [E.success(add ? 'Member added' : 'Member removed', `<@${member.id}> ${add ? 'joined' : 'left'} **${org.name}**.`)],
  });
}

async function list(interaction) {
  await interaction.deferReply({ flags: EPH });

  const filter = interaction.options.getString('type');
  const orgs = db.listOrgs(filter);
  if (!orgs.length) {
    return interaction.editReply({ embeds: [E.info('Nothing registered', 'No organisations yet. Register one with `/org create`.')] });
  }

  const embed = E.base(E.COLORS.brand).setTitle('🏙️ Registered organisations');
  for (const t of TYPES) {
    const group = orgs.filter((o) => o.type === t.value);
    if (!group.length) continue;
    embed.addFields({
      name: `${t.emoji} ${t.name.replace(/^\S+\s/, '')} — ${group.length}`,
      value: clamp(group.map((o) => `**${o.name}** — <@${o.leaderId}> ${o.roleId ? `(<@&${o.roleId}>)` : ''}`).join('\n'), 1000),
    });
  }
  return interaction.editReply({ embeds: [embed] });
}

async function disband(interaction) {
  if (interaction.options.getString('confirm') !== 'DISBAND') {
    return interaction.reply({ embeds: [E.error('Not confirmed', 'Type `DISBAND` in the confirm option to go ahead. This deletes the role and every channel in the organisation’s category.')], flags: EPH });
  }
  await interaction.deferReply({ flags: EPH });

  const key = interaction.options.getString('org');
  const org = db.getOrg(key);
  if (!org) return interaction.editReply({ embeds: [E.error('Not found', 'No organisation with that key.')] });

  const guild = interaction.guild;
  const category = guild.channels.cache.get(org.categoryId);
  if (category) {
    for (const child of guild.channels.cache.filter((c) => c.parentId === category.id).values()) {
      await child.delete('Organisation disbanded').catch(() => {});
    }
    await category.delete('Organisation disbanded').catch(() => {});
  }
  await guild.roles.cache.get(org.roleId)?.delete('Organisation disbanded').catch(() => {});
  db.deleteOrg(key);

  return interaction.editReply({ embeds: [E.success('Disbanded', `**${org.name}** has been removed — role and channels deleted.`)] });
}
