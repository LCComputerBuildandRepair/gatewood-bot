'use strict';
/**
 * /serverinfo — Discord stats side by side with the live city stats, which is
 * the single most convincing "this is a real, busy server" screenshot you can
 * hand someone.
 */
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const fivem = require('../fivem');
const { ts } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Stats for the Discord and the city.'),

  async execute(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    await guild.members.fetch().catch(() => {});

    const humans = guild.members.cache.filter((m) => !m.user.bot).size;
    const bots = guild.members.cache.size - humans;
    const online = guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size;

    const channels = guild.channels.cache;
    const text = channels.filter((c) => c.type === ChannelType.GuildText).size;
    const voice = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categories = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

    const status = await fivem.query();
    const orgs = db.listOrgs();

    const embed = E.base(E.COLORS.brand)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: '👥 Members', value: `**${humans}** people\n${bots} bots · ${online} online`, inline: true },
        { name: '💬 Channels', value: `${text} text · ${voice} voice\n${categories} categories`, inline: true },
        { name: '🎭 Roles', value: String(guild.roles.cache.size - 1), inline: true },
        {
          name: '🏙️ The city',
          value: status.disabled ? 'Status queries off'
            : status.online ? `🟢 **${status.players}/${status.max}** connected`
              : '🔴 Offline',
          inline: true,
        },
        { name: '🏢 Organisations', value: String(orgs.length), inline: true },
        { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount || 0} (tier ${guild.premiumTier})`, inline: true },
        { name: 'Created', value: ts(guild.createdTimestamp), inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
      );

    if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));
    return interaction.editReply({ embeds: [embed] });
  },
};
