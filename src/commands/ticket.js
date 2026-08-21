'use strict';
/**
 * /ticket — in-channel ticket management for staff (the buttons cover the rest).
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const ticketService = require('../services/ticketService');
const { isStaff, clamp, ts } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket you are in.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName('add').setDescription('Add someone to this ticket.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove someone from this ticket.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('close').setDescription('Close this ticket.')
      .addStringOption((o) => o.setName('reason').setDescription('Outcome')))
    .addSubcommand((s) => s.setName('rename').setDescription('Rename this ticket channel.')
      .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true)))
    .addSubcommand((s) => s.setName('info').setDescription('Details about this ticket.'))
    .addSubcommand((s) => s.setName('open').setDescription('Open a ticket on someone’s behalf.')
      .addUserOption((o) => o.setName('member').setDescription('Who it is for').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Ticket type').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    const { TICKET_TYPES } = require('../tickets');
    const focused = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      TICKET_TYPES
        .filter((t) => t.key.includes(focused) || t.label.toLowerCase().includes(focused))
        .map((t) => ({ name: `${t.emoji} ${t.label}`, value: t.key }))
        .slice(0, 25),
    );
  },

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [E.error('Staff only', 'These are staff tools. Members can use the buttons in the ticket.')], flags: EPH });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'open') return openFor(interaction);

    const rec = db.getTicket(interaction.channel.id);
    if (!rec) return interaction.reply({ embeds: [E.error('Not a ticket', 'Run this inside a ticket channel.')], flags: EPH });

    if (sub === 'add') return membership(interaction, true);
    if (sub === 'remove') return membership(interaction, false);
    if (sub === 'close') return close(interaction);
    if (sub === 'rename') return rename(interaction);
    if (sub === 'info') return info(interaction, rec);
  },
};

async function membership(interaction, add) {
  const user = interaction.options.getUser('member');
  await interaction.channel.permissionOverwrites.edit(user.id, add
    ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }
    : { ViewChannel: false });

  await interaction.reply({
    embeds: [E.success(add ? 'Added' : 'Removed', `<@${user.id}> ${add ? 'can now see' : 'no longer sees'} this ticket.`)],
  });
}

async function close(interaction) {
  await interaction.deferReply({ flags: EPH });
  const reason = interaction.options.getString('reason') || 'Closed by staff';
  const count = await ticketService.close(interaction.channel, interaction.user, reason);
  return interaction.editReply({ embeds: [E.success('Closing', `${count} messages archived.`)] });
}

async function rename(interaction) {
  const name = interaction.options.getString('name').slice(0, 90);
  await interaction.channel.setName(name);
  return interaction.reply({ embeds: [E.success('Renamed', `This channel is now **#${name}**.`)], flags: EPH });
}

async function info(interaction, rec) {
  const { byKey } = require('../tickets');
  const type = byKey(rec.type);
  return interaction.reply({
    embeds: [E.base(type?.color || E.COLORS.info)
      .setTitle(`🎫 Ticket #${String(rec.id).padStart(4, '0')}`)
      .addFields(
        { name: 'Type', value: type?.label || rec.type, inline: true },
        { name: 'Opened by', value: `<@${rec.ownerId}>`, inline: true },
        { name: 'Opened', value: ts(rec.createdAt), inline: true },
        { name: 'Claimed by', value: rec.claimedBy ? `<@${rec.claimedBy}>` : 'Unclaimed', inline: true },
      )],
    flags: EPH,
  });
}

async function openFor(interaction) {
  await interaction.deferReply({ flags: EPH });

  const user = interaction.options.getUser('member');
  const type = interaction.options.getString('type');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply({ embeds: [E.error('Not here', 'That member is not in the server.')] });

  try {
    const { channel, existed } = await ticketService.create(interaction.guild, member, type, {
      subject: `Opened on their behalf by ${interaction.user.tag}`,
    });
    return interaction.editReply({
      embeds: [E.success(existed ? 'Already open' : 'Ticket opened', `<#${channel.id}> for <@${user.id}>.`)],
    });
  } catch (err) {
    return interaction.editReply({ embeds: [E.error('Failed', clamp(err.message, 500))] });
  }
}
