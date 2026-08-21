'use strict';
/**
 * /streamers — the Twitch watch list for go-live alerts.
 * Needs TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET in .env to actually fire.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const db = require('../database');
const E = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streamers')
    .setDescription('Twitch go-live alerts.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('add').setDescription('Watch a Twitch channel.')
      .addStringOption((o) => o.setName('login').setDescription('Twitch username (not the display name)').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Stop watching a Twitch channel.')
      .addStringOption((o) => o.setName('login').setDescription('Twitch username').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Everyone being watched.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const list = db.listStreamers();
      const configured = config.twitchClientId && config.twitchClientSecret;
      return interaction.reply({
        embeds: [E.base(E.COLORS.info)
          .setTitle('📺 Twitch watch list')
          .setDescription(list.length
            ? list.map((s) => `• [${s.login}](https://twitch.tv/${s.login}) — added by <@${s.addedBy}>`).join('\n')
            : 'Nobody yet. Add one with `/streamers add`.')
          .setFooter({
            text: configured ? 'Alerts are live — polling every 90 seconds' : '⚠️ Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env to turn alerts on',
            iconURL: E.getBrandIcon() || undefined,
          })],
        flags: EPH,
      });
    }

    const login = interaction.options.getString('login').trim().toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '');

    if (sub === 'add') {
      const added = db.addStreamer(login, interaction.user.id);
      return interaction.reply({
        embeds: [added
          ? E.success('Added', `Watching **${login}**. They get a post in the live-now channel when they go live.`)
          : E.warn('Already watching', `**${login}** is already on the list.`)],
        flags: EPH,
      });
    }

    const removed = db.removeStreamer(login);
    return interaction.reply({
      embeds: [removed ? E.success('Removed', `No longer watching **${login}**.`) : E.error('Not found', `**${login}** was not on the list.`)],
      flags: EPH,
    });
  },
};
