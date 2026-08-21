'use strict';
const { PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { STAFF_KEYS, SENIOR_KEYS } = require('../structure');

/** Mention string for a blueprint role key, or '' if it isn't built/bound yet. */
function roleMention(key) {
  const id = db.roleId(key);
  return id ? `<@&${id}>` : '';
}

/** Mention string for a blueprint channel key, or '' if unknown. */
function channelMention(key) {
  const id = db.channelId(key);
  return id ? `<#${id}>` : '';
}

/** Does the member hold any of these blueprint role keys (Administrator counts)? */
function hasRole(member, ...keys) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return keys.flat().some((k) => {
    const id = db.roleId(k);
    return id && member.roles.cache.has(id);
  });
}

const isStaff = (member) => hasRole(member, STAFF_KEYS);
const isSenior = (member) => hasRole(member, SENIOR_KEYS);

/** Resolve a channel by blueprint key, fetching if it isn't cached. */
async function channelByKey(guild, key) {
  const id = db.channelId(key);
  if (!id) return null;
  return guild.channels.cache.get(id) || guild.channels.fetch(id).catch(() => null);
}

/** Post an embed to a log channel. Logging must never throw. */
async function logTo(guild, channelKey, embed, extra = {}) {
  try {
    const ch = await channelByKey(guild, channelKey);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed], ...extra });
  } catch { /* ignore */ }
}

/** Discord relative timestamp, e.g. "in 4 hours" / "3 days ago". */
const ts = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** "2h 14m" from a minute count. */
function humanMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Parse "10m", "2h", "3d", "1w" into milliseconds. Returns null if unparseable. */
function parseDuration(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2].toLowerCase()];
  return n * unit;
}

/** Trim text to fit an embed field/description without breaking the API call. */
const clamp = (s, n = 1024) => {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
};

/** Slugify a name for use in a Discord channel name. */
const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'unnamed';

/** Fisher-Yates, used by giveaway draws. */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ping string for the staff currently online, so tickets don't mass-ping a
 * sleeping team. Falls back to a plain role mention if presences are missing.
 * Requires the Presence intent to be enabled to pick up online status.
 */
function onlineStaffMention(guild, keys) {
  const ids = keys.map((k) => db.roleId(k)).filter(Boolean);
  if (!ids.length) return '';
  const online = guild.members.cache.filter(
    (m) => !m.user.bot &&
      m.roles.cache.hasAny(...ids) &&
      m.presence && m.presence.status !== 'offline',
  );
  if (!online.size) return ids.map((id) => `<@&${id}>`).join(' ');
  return online.map((m) => `<@${m.id}>`).slice(0, 10).join(' ');
}

/**
 * Collapse permission overwrites so no role id appears twice — Discord rejects
 * the whole payload if one does. Later entries merge into the first, which is
 * what you want when staff and audience lists happen to overlap.
 */
function dedupeOverwrites(list) {
  const byId = new Map();
  for (const entry of list) {
    if (!entry?.id) continue;
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, { id: entry.id, allow: [...(entry.allow || [])], deny: [...(entry.deny || [])] });
      continue;
    }
    existing.allow.push(...(entry.allow || []));
    existing.deny.push(...(entry.deny || []));
  }
  // An explicit allow always beats a deny for the same permission.
  for (const entry of byId.values()) {
    const allowed = new Set(entry.allow.map(String));
    entry.deny = entry.deny.filter((p) => !allowed.has(String(p)));
  }
  return [...byId.values()];
}

module.exports = {
  roleMention, channelMention, hasRole, isStaff, isSenior, dedupeOverwrites,
  channelByKey, logTo, ts, humanMinutes, parseDuration, clamp, slugify,
  shuffle, onlineStaffMention,
};
