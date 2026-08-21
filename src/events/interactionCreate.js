'use strict';
const { MessageFlags } = require('discord.js');
const E = require('../utils/embeds');
const components = require('../components');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // ── Slash commands ──
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        return await command.execute(interaction, client);
      }

      // ── Autocomplete ──
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) return await command.autocomplete(interaction);
        return;
      }

      // ── Buttons / selects / modals ──
      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        return await components.route(interaction);
      }
    } catch (err) {
      console.error(`[interaction] ${interaction.commandName || interaction.customId} failed:`, err);

      // 10062 = the interaction token expired before we answered. Nothing we can
      // send at that point, so don't compound the error by trying.
      if (err.code === 10062) return;

      const payload = {
        embeds: [E.error('Something went wrong', `\`${err.message}\`\n\nIf this keeps happening, open a support ticket and mention what you clicked.`)],
        flags: EPH,
      };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch { /* the interaction is gone */ }
    }
  },
};
