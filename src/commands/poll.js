'use strict';
/**
 * /poll — a quick reaction poll, up to 10 options.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const E = require('../utils/embeds');
const { channelByKey, roleMention } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;
const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Run a poll.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption((o) => o.setName('question').setDescription('The question').setRequired(true))
      .addStringOption((o) => o.setName('option1').setDescription('Option 1').setRequired(true))
      .addStringOption((o) => o.setName('option2').setDescription('Option 2').setRequired(true));
    for (let i = 3; i <= 10; i += 1) {
      b.addStringOption((o) => o.setName(`option${i}`).setDescription(`Option ${i}`));
    }
    b.addChannelOption((o) => o.setName('channel').setDescription('Where to post it'));
    b.addBooleanOption((o) => o.setName('ping').setDescription('Ping the Polls role'));
    return b;
  })(),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const question = interaction.options.getString('question');
    const options = [];
    for (let i = 1; i <= 10; i += 1) {
      const v = interaction.options.getString(`option${i}`);
      if (v) options.push(v);
    }

    const channel = interaction.options.getChannel('channel')
      || await channelByKey(interaction.guild, 'polls')
      || interaction.channel;

    const embed = E.base(E.COLORS.accent)
      .setTitle(`🗳️ ${question}`)
      .setDescription(options.map((o, i) => `${NUMBERS[i]}  ${o}`).join('\n\n'))
      .setFooter({ text: `Poll by ${interaction.user.tag}`, iconURL: E.getBrandIcon() || undefined });

    const sent = await channel.send({
      content: interaction.options.getBoolean('ping') ? (roleMention('p_polls') || undefined) : undefined,
      embeds: [embed],
    });
    for (let i = 0; i < options.length; i += 1) await sent.react(NUMBERS[i]).catch(() => {});

    return interaction.editReply({ embeds: [E.success('Poll posted', `[Jump to it](${sent.url})`)] });
  },
};
