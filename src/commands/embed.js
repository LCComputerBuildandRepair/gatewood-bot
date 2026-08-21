'use strict';
/**
 * /embed and /say — post arbitrary content as the bot, for the bits of the
 * server you want to write by hand (staff team lists, partner pages, lore).
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Post a custom embed as the bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('description').setDescription('Body — use \\n for new lines').setRequired(true))
    .addStringOption((o) => o.setName('title').setDescription('Title'))
    .addChannelOption((o) => o.setName('channel').setDescription('Where to post (default: here)'))
    .addStringOption((o) => o.setName('color').setDescription('Hex colour, e.g. D4AF37'))
    .addStringOption((o) => o.setName('image').setDescription('Large image URL'))
    .addStringOption((o) => o.setName('thumbnail').setDescription('Small thumbnail URL'))
    .addStringOption((o) => o.setName('footer').setDescription('Footer text'))
    .addBooleanOption((o) => o.setName('logo').setDescription('Show the server logo as the thumbnail')),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const color = interaction.options.getString('color');
    const parsed = color ? parseInt(color.replace('#', ''), 16) : NaN;

    const embed = E.base(Number.isNaN(parsed) ? E.COLORS.brand : parsed)
      .setDescription(interaction.options.getString('description').replace(/\\n/g, '\n'));

    const title = interaction.options.getString('title');
    if (title) embed.setTitle(title);

    const footer = interaction.options.getString('footer');
    if (footer) embed.setFooter({ text: footer, iconURL: E.getBrandIcon() || undefined });

    const image = interaction.options.getString('image');
    if (image) embed.setImage(image);

    const thumb = interaction.options.getString('thumbnail');
    if (thumb) embed.setThumbnail(thumb);
    else if (interaction.options.getBoolean('logo') && E.getBrandIcon()) embed.setThumbnail(E.getBrandIcon());

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel.isTextBased()) {
      return interaction.editReply({ embeds: [E.error('Bad channel', 'That channel cannot hold messages.')] });
    }

    const sent = await channel.send({ embeds: [embed] });
    return interaction.editReply({ embeds: [E.success('Posted', `[Jump to it](${sent.url})`)] });
  },
};
