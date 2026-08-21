'use strict';
/**
 * /organize — sort categories into the blueprint order, then departments, then
 * everything else. Purely cosmetic, but a tidy sidebar is most of what makes a
 * server look professionally run.
 */
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');
const { CATEGORY_ORDER, DEPARTMENTS } = require('../structure');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('organize')
    .setDescription('Sort the categories into a sensible order.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const guild = interaction.guild;
    await guild.channels.fetch();

    // Blueprint order first, then each department wing, then support/ticket
    // categories, then anything the bot doesn't know about.
    const desired = [
      ...CATEGORY_ORDER,
      ...DEPARTMENTS.map((d) => `${d.emoji} ┃ ${d.short}`),
    ];

    const categories = [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildCategory);

    const ranked = categories
      .map((c) => ({ c, rank: desired.indexOf(c.name) }))
      .sort((a, b) => {
        if (a.rank === -1 && b.rank === -1) return a.c.position - b.c.position;
        if (a.rank === -1) return 1;
        if (b.rank === -1) return -1;
        return a.rank - b.rank;
      });

    try {
      await guild.channels.setPositions(ranked.map((r, i) => ({ channel: r.c.id, position: i })));
    } catch (err) {
      return interaction.editReply({ embeds: [E.error('Could not reorder', `\`${err.message}\`\nI probably need **Manage Channels**.`)] });
    }

    return interaction.editReply({
      embeds: [E.success('Categories reordered', ranked.map((r, i) => `\`${String(i + 1).padStart(2, '0')}\` ${r.c.name}`).join('\n').slice(0, 3900))],
    });
  },
};
