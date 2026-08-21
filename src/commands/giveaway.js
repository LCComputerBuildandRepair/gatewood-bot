'use strict';
/**
 * /giveaway — button-entry giveaways with a live entry count.
 *
 * Draws are handled by the timer in src/tasks.js, so a restart mid-giveaway
 * doesn't lose it: entries and the end time live in db.json.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const tasks = require('../tasks');
const { parseDuration, channelByKey, roleMention, shuffle, ts } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Run a giveaway.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('start').setDescription('Start a giveaway.')
      .addStringOption((o) => o.setName('prize').setDescription('What they win').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 2h, 3d').setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('How many winners (default 1)'))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post it'))
      .addRoleOption((o) => o.setName('required_role').setDescription('Only this role may enter')))
    .addSubcommand((s) => s.setName('end').setDescription('End a giveaway early and draw now.')
      .addStringOption((o) => o.setName('message_id').setDescription('The giveaway message id').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Draw a replacement winner.')
      .addStringOption((o) => o.setName('message_id').setDescription('The giveaway message id').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'start') return start(interaction);
    if (sub === 'end') return end(interaction);
    if (sub === 'reroll') return reroll(interaction);
  },
};

async function start(interaction) {
  await interaction.deferReply({ flags: EPH });

  const prize = interaction.options.getString('prize');
  const durationText = interaction.options.getString('duration');
  const winners = Math.max(1, interaction.options.getInteger('winners') || 1);
  const requiredRole = interaction.options.getRole('required_role');

  const ms = parseDuration(durationText);
  if (!ms) return interaction.editReply({ embeds: [E.error('Bad duration', 'Use a number and a unit: `2h`, `3d`, `1w`.')] });

  const channel = interaction.options.getChannel('channel')
    || await channelByKey(interaction.guild, 'giveaways')
    || interaction.channel;

  const endsAt = Date.now() + ms;
  const embed = E.base(E.COLORS.brand)
    .setTitle(`🎁 ${prize}`)
    .setDescription(
      `Press **Enter** below to join.\n\n` +
      (requiredRole ? `Restricted to ${requiredRole}.\n\n` : '') +
      `Hosted by <@${interaction.user.id}>.`,
    )
    .addFields(
      { name: 'Ends', value: ts(endsAt), inline: true },
      { name: 'Winners', value: String(winners), inline: true },
      { name: 'Entries', value: '0', inline: true },
    );

  // Post first so we can key the record on the message id the button needs.
  const sent = await channel.send({
    content: roleMention('p_giveaway') || undefined,
    embeds: [embed],
  });

  await sent.edit({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`give:enter:${sent.id}`).setLabel('Enter').setEmoji('🎉').setStyle(ButtonStyle.Success),
    )],
  });

  db.setGiveaway(sent.id, {
    prize, endsAt, winners, hostId: interaction.user.id,
    channelId: channel.id, entries: [], ended: false,
    requiredRoleId: requiredRole?.id || null,
  });

  return interaction.editReply({ embeds: [E.success('Giveaway started', `**${prize}** in <#${channel.id}>, ending ${ts(endsAt)}.`)] });
}

async function end(interaction) {
  await interaction.deferReply({ flags: EPH });
  const id = interaction.options.getString('message_id').trim();
  const winners = await tasks.endGiveaway(interaction.guild, id);

  return interaction.editReply({
    embeds: [winners === null
      ? E.error('Not found', 'No active giveaway with that message id.')
      : E.success('Giveaway ended', winners.length ? `Winners: ${winners.map((w) => `<@${w}>`).join(', ')}` : 'Nobody entered.')],
  });
}

async function reroll(interaction) {
  await interaction.deferReply({ flags: EPH });

  const id = interaction.options.getString('message_id').trim();
  const g = db.getGiveaway(id);
  if (!g) return interaction.editReply({ embeds: [E.error('Not found', 'No giveaway with that message id.')] });

  // Exclude the people who already won so a reroll is a real replacement.
  const pool = (g.entries || []).filter((e) => !(g.winnerIds || []).includes(e));
  if (!pool.length) return interaction.editReply({ embeds: [E.warn('No one left', 'Everyone who entered has already won.')] });

  const [winner] = shuffle(pool);
  db.setGiveaway(id, { ...g, winnerIds: [...(g.winnerIds || []), winner] });

  const channel = interaction.guild.channels.cache.get(g.channelId);
  await channel?.send({ content: `🎉 Reroll — <@${winner}> wins **${g.prize}**! Open a ticket to claim it.` }).catch(() => {});

  return interaction.editReply({ embeds: [E.success('Rerolled', `New winner: <@${winner}>`)] });
}
