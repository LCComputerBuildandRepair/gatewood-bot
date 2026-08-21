'use strict';
/**
 * /panel — (re)post any interactive panel.
 *
 * Use this after editing content.js, changing whitelist mode, or if someone
 * deletes a panel by accident. Optionally wipes the bot's old messages in the
 * channel first so you don't end up with three rulebook covers.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');
const panels = require('../panels');
const { channelByKey } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

// panel name → [builder, default channel key]
const PANELS = {
  welcome:      [panels.welcomePanel, 'welcome'],
  rules:        [panels.rulesPanel, 'rules'],
  verify:       [panels.verifyPanel, 'verify'],
  roles:        [panels.rolesPanel, 'roles'],
  tickets:      [panels.ticketPanel, 'support'],
  applications: [panels.applicationsPanel, 'applications'],
  faq:          [panels.faqPanel, 'faq'],
  connect:      [panels.connectPanel, 'connect'],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post or re-post an interactive panel.')
    .addStringOption((o) => o.setName('which').setDescription('Which panel').setRequired(true)
      .addChoices(...Object.keys(PANELS).map((k) => ({ name: k, value: k }))))
    .addChannelOption((o) => o.setName('channel').setDescription('Override the destination channel'))
    .addBooleanOption((o) => o.setName('replace').setDescription('Delete my previous messages in that channel first'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const which = interaction.options.getString('which');
    const [build, defaultKey] = PANELS[which];
    const channel = interaction.options.getChannel('channel')
      || await channelByKey(interaction.guild, defaultKey);

    if (!channel?.isTextBased()) {
      return interaction.editReply({
        embeds: [E.error('No destination', `I could not find the default channel for **${which}**. Run \`/setup\` first, or pass a channel.`)],
      });
    }

    if (interaction.options.getBoolean('replace')) {
      const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      const mine = recent?.filter((m) => m.author.id === interaction.client.user.id);
      if (mine?.size) await channel.bulkDelete(mine, true).catch(() => {});
    }

    await channel.send(build());
    return interaction.editReply({ embeds: [E.success('Panel posted', `**${which}** → <#${channel.id}>`)] });
  },
};
