'use strict';
/**
 * /announce — branded announcements and changelogs, with the right ping.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');
const { channelByKey, roleMention } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

const KINDS = {
  general:  { key: 'announce', ping: 'p_announce', emoji: '📣', color: E.COLORS.brand,   title: 'Announcement' },
  update:   { key: 'updates',  ping: 'p_updates',  emoji: '🧩', color: E.COLORS.accent,  title: 'Server Update' },
  event:    { key: 'events',   ping: 'p_events',   emoji: '🎉', color: E.COLORS.success, title: 'Event' },
  hiring:   { key: 'hiring',   ping: 'p_hiring',   emoji: '📢', color: E.COLORS.warn,    title: 'Now Hiring' },
  maintenance: { key: 'announce', ping: 'p_restart', emoji: '🔧', color: E.COLORS.error, title: 'Maintenance' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a branded announcement.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('kind').setDescription('What kind of announcement').setRequired(true)
      .addChoices(...Object.keys(KINDS).map((k) => ({ name: k, value: k }))))
    .addStringOption((o) => o.setName('title').setDescription('Headline').setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('Body — use \\n for new lines').setRequired(true))
    .addChannelOption((o) => o.setName('channel').setDescription('Override the destination'))
    .addStringOption((o) => o.setName('image').setDescription('Image URL'))
    .addBooleanOption((o) => o.setName('ping').setDescription('Ping the matching notification role (default: yes)')),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const kind = KINDS[interaction.options.getString('kind')];
    const channel = interaction.options.getChannel('channel')
      || await channelByKey(interaction.guild, kind.key)
      || interaction.channel;

    if (!channel.isTextBased()) {
      return interaction.editReply({ embeds: [E.error('Bad channel', 'That channel cannot hold messages.')] });
    }

    const embed = E.base(kind.color)
      .setTitle(`${kind.emoji} ${interaction.options.getString('title')}`)
      .setDescription(interaction.options.getString('message').replace(/\\n/g, '\n'))
      .setFooter({ text: `${kind.title} • posted by ${interaction.user.tag}`, iconURL: E.getBrandIcon() || undefined });

    const image = interaction.options.getString('image');
    if (image) embed.setImage(image);

    const shouldPing = interaction.options.getBoolean('ping') ?? true;
    const sent = await channel.send({
      content: shouldPing ? (roleMention(kind.ping) || undefined) : undefined,
      embeds: [embed],
    });

    // Announcement channels can be published to every server that follows them.
    if (channel.type === 5 /* GuildAnnouncement */) await sent.crosspost().catch(() => {});

    return interaction.editReply({ embeds: [E.success('Posted', `[Jump to the announcement](${sent.url})`)] });
  },
};
