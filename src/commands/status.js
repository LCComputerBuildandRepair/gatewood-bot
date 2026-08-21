'use strict';
/**
 * /status — force a refresh of the live status embed, or show it here.
 * The embed in #server-status updates itself every 60 seconds regardless.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');
const fivem = require('../fivem');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show the live server status.')
    .addBooleanOption((o) => o.setName('public').setDescription('Post it in this channel instead of privately')),

  async execute(interaction, client) {
    const isPublic = interaction.options.getBoolean('public') ?? false;
    await interaction.deferReply(isPublic ? {} : { flags: EPH });

    const status = await fivem.query();
    const embed = fivem.statusEmbed(status);

    // Also nudge the permanent embed in #server-status so it never looks stale.
    fivem.refresh(client).catch(() => {});

    return interaction.editReply({ embeds: [embed] });
  },
};
