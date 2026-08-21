'use strict';
/**
 * /build-tickets — pre-create a category for every ticket type.
 *
 * Not strictly required (a category is created on demand when the first ticket
 * of a type is opened), but doing it up front means the server looks finished
 * before anyone opens a ticket, and lets you reorder the categories by hand.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');
const { TICKET_TYPES } = require('../tickets');
const ticketService = require('../services/ticketService');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('build-tickets')
    .setDescription('Create the category for each ticket type up front.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });
    const log = [];

    for (const type of TICKET_TYPES) {
      try {
        const cat = await ticketService.ticketCategory(interaction.guild, type);
        log.push(`${type.emoji} **${type.label}** → ${cat.name}`);
      } catch (err) {
        log.push(`❌ ${type.label} — ${err.message}`);
      }
    }

    return interaction.editReply({
      embeds: [E.success('Ticket categories ready', log.join('\n'))
        .setFooter({ text: 'Post the ticket panel with /panel tickets', iconURL: E.getBrandIcon() || undefined })],
    });
  },
};
