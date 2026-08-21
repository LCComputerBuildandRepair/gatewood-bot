'use strict';
/**
 * Zero-dependency JSON store. Keeps installs painless on any box (no native
 * modules to compile). All bot state lives in data/db.json and is written
 * synchronously after every mutation — fine at Discord-bot write volumes.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULTS = {
  // Registry of everything /setup built, so features can find things later.
  ids: { roles: {}, channels: {}, categories: {}, messages: {} },

  settings: {
    whitelistMode: 'open',       // 'open' | 'application'
    applicationsOpen: {},        // appKey → bool (missing = open)
    automod: true,
    levelingEnabled: true,
    welcomeEnabled: true,
    statusMessageId: null,
    statusChannelId: null,
  },

  tickets: {},        // channelId → { id, ownerId, type, claimedBy, createdAt }
  applications: {},   // appId     → { userId, type, answers, status, reviewer, at }
  warnings: {},       // userId    → [ { id, mod, reason, at } ]
  notes: {},          // userId    → [ { mod, note, at } ]
  levels: {},         // userId    → { xp, level, msgs }
  tempVcs: {},        // channelId → ownerId
  starboard: {},      // srcMsgId  → starMsgId
  links: {},          // userId    → { license, steam, name, at }
  priority: {},       // userId    → { slots, tier, until }
  shifts: {},         // userId    → { since, dept } while on duty
  shiftLog: {},       // userId    → [ { dept, start, end, minutes } ]
  orgs: {},           // orgKey    → { name, type, leaderId, roleId, categoryId }
  giveaways: {},      // msgId     → { prize, endsAt, winners, hostId, entries, channelId, ended }
  suggestions: {},    // msgId     → { userId, text, status }
  streamers: [],      // [{ login, addedBy }]
  live: {},           // login     → stream id (dedupe go-live posts)
  restarts: [],       // ["04:00", "10:00", ...] local-time restart schedule
  counters: { ticket: 0, application: 0, warning: 0, org: 0 },
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = deepDefaults(raw, DEFAULTS);
  } catch {
    cache = JSON.parse(JSON.stringify(DEFAULTS));
  }
  return cache;
}

// Merge saved data over the defaults one level deep, so adding a new key to
// DEFAULTS in a later version doesn't leave old db.json files missing it.
function deepDefaults(raw, defaults) {
  const out = { ...JSON.parse(JSON.stringify(defaults)), ...raw };
  for (const [k, v] of Object.entries(defaults)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...v, ...(raw[k] || {}) };
    }
  }
  return out;
}

function save() {
  if (!cache) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

const db = {
  get all() { return load(); },
  save,

  // ── id registry ────────────────────────────────────────────────────────────
  setId(kind, key, id) { load().ids[kind][key] = id; save(); },
  getId(kind, key) { return load().ids[kind][key]; },
  roleId(key) { return load().ids.roles[key]; },
  channelId(key) { return load().ids.channels[key]; },
  categoryId(key) { return load().ids.categories[key]; },
  allIds(kind) { return load().ids[kind]; },
  clearId(kind, key) { delete load().ids[kind][key]; save(); },

  // ── settings ───────────────────────────────────────────────────────────────
  get(key, dflt = null) {
    const v = load().settings[key];
    return v === undefined ? dflt : v;
  },
  set(key, value) { load().settings[key] = value; save(); },

  nextCounter(name) {
    const d = load();
    d.counters[name] = (d.counters[name] || 0) + 1;
    save();
    return d.counters[name];
  },

  // ── tickets ────────────────────────────────────────────────────────────────
  setTicket(channelId, data) { load().tickets[channelId] = data; save(); },
  getTicket(channelId) { return load().tickets[channelId]; },
  deleteTicket(channelId) { delete load().tickets[channelId]; save(); },
  openTicketFor(userId, type) {
    const found = Object.entries(load().tickets)
      .find(([, t]) => t.ownerId === userId && t.type === type);
    return found ? found[0] : null;
  },

  // ── applications ───────────────────────────────────────────────────────────
  setApplication(id, data) { load().applications[id] = data; save(); },
  getApplication(id) { return load().applications[id]; },
  userApplications(userId) {
    return Object.entries(load().applications)
      .filter(([, a]) => a.userId === userId)
      .map(([id, a]) => ({ id, ...a }));
  },
  isAppOpen(key) {
    const v = load().settings.applicationsOpen[key];
    return v === undefined ? true : !!v;
  },
  setAppOpen(key, open) { load().settings.applicationsOpen[key] = !!open; save(); },

  // ── moderation ─────────────────────────────────────────────────────────────
  addWarning(userId, entry) { (load().warnings[userId] ||= []).push(entry); save(); },
  getWarnings(userId) { return load().warnings[userId] || []; },
  clearWarnings(userId) { delete load().warnings[userId]; save(); },
  removeWarning(userId, id) {
    const d = load();
    if (!d.warnings[userId]) return false;
    const before = d.warnings[userId].length;
    d.warnings[userId] = d.warnings[userId].filter((w) => w.id !== id);
    save();
    return d.warnings[userId].length < before;
  },
  addNote(userId, entry) { (load().notes[userId] ||= []).push(entry); save(); },
  getNotes(userId) { return load().notes[userId] || []; },

  // ── leveling ───────────────────────────────────────────────────────────────
  getLevel(userId) { return load().levels[userId] || { xp: 0, level: 0, msgs: 0 }; },
  setLevel(userId, data) { load().levels[userId] = data; save(); },
  topLevels(n = 10) {
    return Object.entries(load().levels)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, n);
  },

  // ── temp voice ─────────────────────────────────────────────────────────────
  addTempVc(channelId, ownerId) { load().tempVcs[channelId] = ownerId; save(); },
  isTempVc(channelId) { return !!load().tempVcs[channelId]; },
  removeTempVc(channelId) { delete load().tempVcs[channelId]; save(); },

  // ── starboard ──────────────────────────────────────────────────────────────
  getStar(srcId) { return load().starboard[srcId]; },
  setStar(srcId, starId) { load().starboard[srcId] = starId; save(); },

  // ── in-game account links ──────────────────────────────────────────────────
  setLink(userId, data) { load().links[userId] = data; save(); },
  getLink(userId) { return load().links[userId]; },
  removeLink(userId) { delete load().links[userId]; save(); },
  userByLicense(license) {
    const found = Object.entries(load().links).find(([, l]) => l.license === license);
    return found ? found[0] : null;
  },
  allLinks() { return load().links; },

  // ── priority queue ─────────────────────────────────────────────────────────
  setPriority(userId, data) { load().priority[userId] = data; save(); },
  getPriority(userId) { return load().priority[userId]; },
  removePriority(userId) { delete load().priority[userId]; save(); },
  allPriority() { return load().priority; },

  // ── staff / department duty shifts ─────────────────────────────────────────
  startShift(userId, dept) { load().shifts[userId] = { since: Date.now(), dept }; save(); },
  getShift(userId) { return load().shifts[userId]; },
  endShift(userId) {
    const d = load();
    const s = d.shifts[userId];
    if (!s) return null;
    const minutes = Math.round((Date.now() - s.since) / 60000);
    (d.shiftLog[userId] ||= []).push({ dept: s.dept, start: s.since, end: Date.now(), minutes });
    delete d.shifts[userId];
    save();
    return { ...s, minutes };
  },
  onDuty() { return load().shifts; },
  shiftTotals(userId) {
    return (load().shiftLog[userId] || []).reduce((a, s) => a + s.minutes, 0);
  },

  // ── organisations (gangs / MCs / businesses) ───────────────────────────────
  setOrg(key, data) { load().orgs[key] = data; save(); },
  getOrg(key) { return load().orgs[key]; },
  deleteOrg(key) { delete load().orgs[key]; save(); },
  listOrgs(type = null) {
    return Object.entries(load().orgs)
      .map(([key, o]) => ({ key, ...o }))
      .filter((o) => !type || o.type === type);
  },

  // ── giveaways ──────────────────────────────────────────────────────────────
  setGiveaway(msgId, data) { load().giveaways[msgId] = data; save(); },
  getGiveaway(msgId) { return load().giveaways[msgId]; },
  activeGiveaways() {
    return Object.entries(load().giveaways)
      .filter(([, g]) => !g.ended)
      .map(([id, g]) => ({ id, ...g }));
  },

  // ── suggestions ────────────────────────────────────────────────────────────
  setSuggestion(msgId, data) { load().suggestions[msgId] = data; save(); },
  getSuggestion(msgId) { return load().suggestions[msgId]; },

  // ── restart schedule ───────────────────────────────────────────────────────
  getRestarts() { return load().restarts; },
  setRestarts(list) { load().restarts = list; save(); },

  // ── twitch ─────────────────────────────────────────────────────────────────
  listStreamers() { return load().streamers; },
  addStreamer(login, addedBy) {
    const d = load();
    const l = login.toLowerCase();
    if (d.streamers.some((s) => s.login === l)) return false;
    d.streamers.push({ login: l, addedBy });
    save();
    return true;
  },
  removeStreamer(login) {
    const d = load();
    const l = login.toLowerCase();
    const before = d.streamers.length;
    d.streamers = d.streamers.filter((s) => s.login !== l);
    delete d.live[l];
    save();
    return d.streamers.length < before;
  },
  isLive(login) { return !!load().live[login.toLowerCase()]; },
  setLive(login, id) { load().live[login.toLowerCase()] = id; save(); },
  clearLive(login) { delete load().live[login.toLowerCase()]; save(); },
};

module.exports = db;
