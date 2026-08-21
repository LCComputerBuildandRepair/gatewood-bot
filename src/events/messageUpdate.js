'use strict';
const db = require('../database');
const E = require('../utils/embeds');
const { logTo, clamp } = require('../utils/helpers');

module.exports = {
  name: 'messageUpdate',
  async execute(before, after) {
    if (!after.guild || after.author?.bot) return;
    if (before.content === after.content) return; // embed loaded, not a real edit
    if (db.getTicket(after.channelId)) return;

    await logTo(after.guild, 'message_logs', E.base(E.COLORS.warn)
      .setTitle('✏️ Message edited')
      .setURL(after.url)
      .addFields(
        { name: 'Author', value: `<@${after.author.id}>`, inline: true },
        { name: 'Channel', value: `<#${after.channelId}>`, inline: true },
        { name: 'Before', value: clamp(before.content || '*(unknown — not cached)*', 1000) },
        { name: 'After', value: clamp(after.content || '*(empty)*', 1000) },
      ));
  },
};
