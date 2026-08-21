'use strict';
/**
 * /rank and /leaderboard — Discord activity levels.
 * The curve matches the one in events/messageCreate.js.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const { xpForLevel } = require('../events/messageCreate');

const EPH = MessageFlags.Ephemeral;

function bar(current, needed, width = 18) {
  const filled = Math.max(0, Math.min(width, Math.round((current / needed) * width)));
  return `\`${'█'.repeat(filled)}${'░'.repeat(width - filled)}\``;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Your activity level in the Discord.')
    .addUserOption((o) => o.setName('member').setDescription('Someone else’s level')),

  async execute(interaction) {
    const user = interaction.options.getUser('member') || interaction.user;
    const data = db.getLevel(user.id);

    if (!data.xp) {
      return interaction.reply({
        embeds: [E.info('No activity yet', `<@${user.id}> has not earned any XP. Talk in the community channels to start.`)],
        flags: EPH,
      });
    }

    const floor = xpForLevel(data.level);
    const ceiling = xpForLevel(data.level + 1);
    const into = data.xp - floor;
    const needed = ceiling - floor;

    const all = db.topLevels(10_000);
    const position = all.findIndex((r) => r.id === user.id) + 1;

    return interaction.reply({
      embeds: [E.base(E.COLORS.brand)
        .setTitle(`📈 ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(`${bar(into, needed)}  **${Math.round(into)} / ${Math.round(needed)}** XP`)
        .addFields(
          { name: 'Level', value: `**${data.level}**`, inline: true },
          { name: 'Total XP', value: String(Math.round(data.xp)), inline: true },
          { name: 'Rank', value: position ? `#${position} of ${all.length}` : '—', inline: true },
        )],
      flags: EPH,
    });
  },
};
