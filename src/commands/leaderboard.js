'use strict';
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const { clamp } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('The most active members in the Discord.')
    .addIntegerOption((o) => o.setName('count').setDescription('How many to show (default 10, max 25)')),

  async execute(interaction) {
    await interaction.deferReply();

    const count = Math.max(1, Math.min(25, interaction.options.getInteger('count') || 10));
    const top = db.topLevels(count);

    if (!top.length) {
      return interaction.editReply({ embeds: [E.info('Nothing yet', 'Nobody has earned XP. Get talking.')] });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((r, i) =>
      `${medals[i] || `\`${String(i + 1).padStart(2, ' ')}\``} <@${r.id}> — level **${r.level}** · ${Math.round(r.xp).toLocaleString()} XP`);

    return interaction.editReply({
      embeds: [E.base(E.COLORS.brand)
        .setTitle('🏆 Most active members')
        .setDescription(clamp(lines.join('\n'), 3800))
        .setFooter({ text: 'Check your own with /rank', iconURL: E.getBrandIcon() || undefined })],
    });
  },
};
