'use strict';
/**
 * /reset — delete everything the bot created and forget its bindings.
 *
 * The nuclear option, for when you want to rebuild from scratch. It only
 * touches things recorded in db.json, so channels you made by hand survive.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Delete everything the bot created. Cannot be undone.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName('confirm').setDescription('Type RESET to confirm').setRequired(true))
    .addBooleanOption((o) => o.setName('keep_roles').setDescription('Delete channels but leave the roles alone')),

  async execute(interaction) {
    if (interaction.options.getString('confirm') !== 'RESET') {
      return interaction.reply({
        embeds: [E.error('Not confirmed', 'Type `RESET` in the confirm option. This deletes every channel and role the bot created.')],
        flags: EPH,
      });
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [E.error('Admins only', 'Administrator required.')], flags: EPH });
    }

    await interaction.deferReply({ flags: EPH });

    const guild = interaction.guild;
    const keepRoles = interaction.options.getBoolean('keep_roles') ?? false;
    let channels = 0;
    let categories = 0;
    let roles = 0;

    for (const id of Object.values(db.allIds('channels'))) {
      const c = guild.channels.cache.get(id);
      if (c && await c.delete('Bot reset').then(() => true).catch(() => false)) channels += 1;
    }
    for (const id of Object.values(db.allIds('categories'))) {
      const c = guild.channels.cache.get(id);
      if (c && await c.delete('Bot reset').then(() => true).catch(() => false)) categories += 1;
    }
    if (!keepRoles) {
      for (const id of Object.values(db.allIds('roles'))) {
        const r = guild.roles.cache.get(id);
        if (r && !r.managed && await r.delete('Bot reset').then(() => true).catch(() => false)) roles += 1;
      }
    }

    // Forget the bindings, keep the history (warnings, applications, levels).
    const data = db.all;
    data.ids = { roles: keepRoles ? data.ids.roles : {}, channels: {}, categories: {}, messages: {} };
    data.settings.statusMessageId = null;
    data.settings.statusChannelId = null;
    db.save();

    return interaction.editReply({
      embeds: [E.success('Reset complete',
        `Deleted **${channels}** channels, **${categories}** categories and **${roles}** roles.\n\n` +
        'Warnings, applications, levels and links were kept. Run `/setup` to rebuild.')],
    });
  },
};
