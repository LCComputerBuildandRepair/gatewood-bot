'use strict';
/**
 * Gatewood RP — all-in-one Discord bot.
 *
 * Loads every command in src/commands and every event in src/events, then logs
 * in. Slash commands are registered to the guild on ready, so they show up
 * immediately rather than after Discord's global propagation delay.
 */
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./src/config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,          // privileged — enable in the Dev Portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,        // privileged — enable in the Dev Portal
    GatewayIntentBits.GuildPresences,        // privileged — used to ping only ONLINE staff
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction, Partials.User],
});

// ── Commands ─────────────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'src', 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  if (cmd?.data?.name && typeof cmd.execute === 'function') {
    client.commands.set(cmd.data.name, cmd);
  } else {
    console.warn(`[load] Skipped ${file} — missing data/execute.`);
  }
}
console.log(`[load] ${client.commands.size} commands loaded.`);

// ── Events ───────────────────────────────────────────────────────────────────
const eventsDir = path.join(__dirname, 'src', 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const evt = require(path.join(eventsDir, file));
  if (!evt?.name || typeof evt.execute !== 'function') continue;
  if (evt.once) client.once(evt.name, (...args) => evt.execute(...args, client));
  else client.on(evt.name, (...args) => evt.execute(...args, client));
}

// ── Safety nets ──────────────────────────────────────────────────────────────
// A single unhandled rejection should never take the whole city's Discord down.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[shutdown] ${signal} received — closing cleanly.`);
    require('./src/fivem').stop();
    require('./src/tasks').stop();
    require('./src/twitch').stop();
    require('./src/bridge').stop();
    require('./src/statusapi').stop();
    client.destroy();
    process.exit(0);
  });
}

client.login(config.token).catch(async (err) => {
  // Fail loudly and exit rather than hanging on a dead socket — the two causes
  // are almost always a bad token or missing privileged intents, and both are
  // worth naming outright on someone's first run.
  console.error('\n[login] Could not connect to Discord.');
  if (err.code === 'TokenInvalid') {
    console.error('        The DISCORD_TOKEN in .env is not valid.');
    console.error('        Reset it at https://discord.com/developers/applications → your app → Bot.\n');
  } else if (err.code === 'DisallowedIntents') {
    console.error('        Privileged intents are not enabled for this bot.');
    console.error('        Turn on Server Members, Message Content and Presence at');
    console.error('        https://discord.com/developers/applications → your app → Bot.\n');
  } else {
    console.error(`        ${err.message}\n`);
  }
  // Tear the client down before exiting; calling process.exit() while the
  // websocket is still closing trips a libuv assertion on Windows.
  await client.destroy().catch(() => {});
  process.exitCode = 1;
});
