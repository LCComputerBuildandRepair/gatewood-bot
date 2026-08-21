'use strict';
/**
 * Manual slash-command registration.
 *
 * The bot already registers its commands on every startup, so you rarely need
 * this — it exists for when you want to push a command change without
 * restarting, or to wipe stale commands with `node src/deploy.js --clear`.
 */
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

(async () => {
  const clear = process.argv.includes('--clear');
  const body = [];

  if (!clear) {
    const dir = path.join(__dirname, 'commands');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const cmd = require(path.join(dir, file));
      if (cmd?.data?.toJSON) body.push(cmd.data.toJSON());
    }
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(clear
      ? '[deploy] Cleared all guild commands.'
      : `[deploy] Registered ${body.length} commands to guild ${config.guildId}.`);
  } catch (err) {
    console.error('[deploy] Failed:', err.message);
    process.exit(1);
  }
})();
