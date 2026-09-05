'use strict';
const { REST, Routes, ActivityType } = require('discord.js');
const config = require('../config');
const E = require('../utils/embeds');
const fivem = require('../fivem');
const tasks = require('../tasks');
const twitch = require('../twitch');
const bridge = require('../bridge');
const statusapi = require('../statusapi');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`[ready] Logged in as ${client.user.tag}`);

    // Every embed carries the server logo. Prefer LOGO_URL, fall back to the
    // bot's own avatar (set that from assets/logo.png with `npm run avatar`).
    E.setBrandIcon(config.logoUrl || client.user.displayAvatarURL({ size: 256 }));

    // Register slash commands to the guild — guild commands appear instantly,
    // global ones can take an hour to propagate.
    try {
      const body = [...client.commands.values()].map((c) => c.data.toJSON());
      const rest = new REST({ version: '10' }).setToken(config.token);
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
      console.log(`[ready] Registered ${body.length} slash commands to guild ${config.guildId}.`);
    } catch (err) {
      console.error('[ready] Command registration failed:', err.message);
    }

    // Warm the member cache so staff-online pings and role checks are accurate.
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
      await guild.members.fetch().catch(() => {});
      console.log(`[ready] Cached ${guild.memberCount} members of "${guild.name}".`);
    } else {
      console.warn(`[ready] Bot is not in guild ${config.guildId} — check GUILD_ID.`);
    }

    client.user.setPresence({
      status: 'online',
      activities: [{ name: `${config.communityName}`, type: ActivityType.Watching }],
    });

    fivem.start(client);   // live status embed + player-count presence
    tasks.start(client);   // stat counters, restart countdown, giveaway draws
    twitch.start(client);  // go-live alerts (no-op without credentials)
    bridge.start(client);  // in-game HTTP bridge (no-op unless enabled)
    statusapi.start(client); // public status API for the website (no-op unless enabled)
  },
};
