'use strict';
const db = require('../database');
const E = require('../utils/embeds');
const { logTo, clamp } = require('../utils/helpers');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    // Don't mirror ticket contents into the public-ish log channel; the
    // transcript already captures those.
    if (db.getTicket(message.channelId)) return;

    await logTo(message.guild, 'message_logs', E.base(E.COLORS.error)
      .setTitle('🗑️ Message deleted')
      .addFields(
        { name: 'Author', value: message.author ? `<@${message.author.id}>` : 'Unknown', inline: true },
        { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
        { name: 'Content', value: clamp(message.content || '*(no text — embed or attachment)*', 1000) },
      ));
  },
};
