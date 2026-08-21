'use strict';
require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`\n[config] Missing required env var: ${name}`);
    console.error('         Copy .env.example to .env and fill it in.\n');
    process.exit(1);
  }
  return v;
}

const bool = (v, dflt = false) =>
  v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(String(v));

module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),

  communityName: process.env.COMMUNITY_NAME || 'Gatewood RP',
  brandColor: parseInt(process.env.BRAND_COLOR || 'D4AF37', 16),
  accentColor: parseInt(process.env.ACCENT_COLOR || '2B6CB0', 16),
  logoUrl: process.env.LOGO_URL || null,
  storeUrl: process.env.STORE_URL || null,
  websiteUrl: process.env.WEBSITE_URL || null,
  connectUrl: process.env.CONNECT_URL || null,

  server: {
    enabled: bool(process.env.SERVER_QUERY_ENABLED, true),
    host: process.env.SERVER_HOST || '127.0.0.1',
    port: parseInt(process.env.SERVER_PORT || '30120', 10),
    cfxCode: process.env.CFX_CODE || null,
    maxSlots: parseInt(process.env.SERVER_MAX_SLOTS || '64', 10),
  },

  bridge: {
    enabled: bool(process.env.BRIDGE_ENABLED, false),
    port: parseInt(process.env.BRIDGE_PORT || '30122', 10),
    secret: process.env.BRIDGE_SECRET || '',
  },

  twitchClientId: process.env.TWITCH_CLIENT_ID || null,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || null,
};
