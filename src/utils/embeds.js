'use strict';
const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const COLORS = {
  brand: config.brandColor,
  accent: config.accentColor,
  success: 0x22C55E,
  warn: 0xF59E0B,
  error: 0xEF4444,
  info: config.accentColor,
  dark: 0x111827,
};

// The server logo, shown on every embed. Set once at startup from config.logoUrl
// or the bot's own avatar (see events/ready.js → setBrandIcon).
let BRAND_ICON = config.logoUrl;
const setBrandIcon = (url) => { BRAND_ICON = url; };
const getBrandIcon = () => BRAND_ICON;

function base(color = COLORS.brand) {
  const e = new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: config.communityName, iconURL: BRAND_ICON || undefined })
    .setTimestamp();
  if (BRAND_ICON) e.setAuthor({ name: config.communityName, iconURL: BRAND_ICON });
  return e;
}

module.exports = {
  COLORS,
  base,
  setBrandIcon,
  getBrandIcon,
  brand:   (t, d) => base(COLORS.brand).setTitle(t).setDescription(d || null),
  info:    (t, d) => base(COLORS.info).setTitle(t).setDescription(d || null),
  success: (t, d) => base(COLORS.success).setTitle(`✅ ${t}`).setDescription(d || null),
  warn:    (t, d) => base(COLORS.warn).setTitle(`⚠️ ${t}`).setDescription(d || null),
  error:   (t, d) => base(COLORS.error).setTitle(`❌ ${t}`).setDescription(d || null),
};
