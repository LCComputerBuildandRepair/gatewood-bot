'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a plain message as the bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('message').setDescription('What to say — use \\n for new lines').setRequired(true))
    .addChannelOption((o) => o.setName('channel').setDescription('Where (default: here)'))
    .addStringOption((o) => o.setName('reply_to').setDescription('Message id to reply to')),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const content = interaction.options.getString('message').replace(/\\n/g, '\n');
    const replyTo = interaction.options.getString('reply_to');

    // Never let /say be used to mass-ping; @everyone stays off regardless.
    const sent = await channel.send({
      content,
      reply: replyTo ? { messageReference: replyTo, failIfNotExists: false } : undefined,
      allowedMentions: { parse: ['users', 'roles'] },
    });

    return interaction.editReply({ embeds: [E.success('Sent', `[Jump to it](${sent.url})`)] });
  },
};
