'use strict';
/**
 * Starboard — clips and screenshots that get ⭐'d enough are copied into
 * #highlights, which is what makes a server's media feel active.
 */
const db = require('../database');
const E = require('../utils/embeds');
const { channelByKey, clamp } = require('../utils/helpers');

const STAR_EMOJI = '⭐';
const THRESHOLD = 3;

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
    if (reaction.emoji.name !== STAR_EMOJI) return;
    if (reaction.count < THRESHOLD) return;

    const message = reaction.message.partial
      ? await reaction.message.fetch().catch(() => null)
      : reaction.message;
    if (!message?.guild || message.author?.bot) return;

    const board = await channelByKey(message.guild, 'highlights');
    if (!board?.isTextBased() || board.id === message.channel.id) return;

    const existingId = db.getStar(message.id);
    const embed = E.base(E.COLORS.brand)
      .setTitle(`${STAR_EMOJI} ${reaction.count} — highlight`)
      .setDescription(clamp(message.content || '*(no text)*', 2000))
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .addFields({ name: 'Jump', value: `[Go to the message](${message.url})` });

    const image = [...message.attachments.values()].find((a) => a.contentType?.startsWith('image'));
    if (image) embed.setImage(image.url);

    if (existingId) {
      const existing = await board.messages.fetch(existingId).catch(() => null);
      if (existing) return existing.edit({ embeds: [embed] }).catch(() => {});
    }

    const sent = await board.send({ embeds: [embed] }).catch(() => null);
    if (sent) db.setStar(message.id, sent.id);
  },
};
