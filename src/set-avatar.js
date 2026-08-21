'use strict';
/**
 * One-shot helper: sets the bot's avatar from assets/logo.png (or .jpg).
 * Run with `npm run avatar`. Discord rate-limits avatar changes, so don't
 * run it in a loop.
 */
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');

const candidates = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.gif']
  .map((f) => path.join(__dirname, '..', 'assets', f));
const file = candidates.find((p) => fs.existsSync(p));

if (!file) {
  console.error('[avatar] No assets/logo.png (or .jpg/.gif) found. Drop your logo there first.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    await client.user.setAvatar(file);
    console.log(`[avatar] Set from ${path.basename(file)}.`);
  } catch (err) {
    console.error('[avatar] Failed:', err.message);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(config.token);
