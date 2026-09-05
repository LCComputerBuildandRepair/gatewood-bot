'use strict';
/**
 * Gatewood RP — server blueprint.
 *
 * Single source of truth for /setup. Edit this file to change what the bot
 * builds (roles, categories, channels, permissions), then run /setup again —
 * it reconciles the live server against this blueprint: anything missing is
 * created, anything already there (matched by name) is reused. Nothing is ever
 * deleted by /setup.
 *
 * Permission tokens below map to discord.js PermissionFlagsBits in setup.js.
 */

// ── Roles ────────────────────────────────────────────────────────────────────
// Listed highest-first. `key` is the stable handle the bot stores in db.json so
// every other feature can find the role later by purpose rather than by name.
const ROLES = [
  // ── Staff ladder ──
  { key: 'owner',      name: '👑 Owner',              color: 0xD4AF37, hoist: true,  admin: true },
  { key: 'coowner',    name: '🔱 Co-Owner',           color: 0xC9A227, hoist: true,  admin: true },
  { key: 'management', name: '🗝️ Management',         color: 0xB8860B, hoist: true,  admin: true },
  { key: 'developer',  name: '💻 Developer',          color: 0x38BDF8, hoist: true,  admin: true },
  { key: 'headadmin',  name: '⚜️ Head Administrator', color: 0xEF4444, hoist: true,
    perms: ['KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages', 'ManageNicknames', 'ManageChannels', 'ManageRoles', 'ViewAuditLog'] },
  { key: 'admin',      name: '🛡️ Administrator',      color: 0xF97316, hoist: true,
    perms: ['KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages', 'ManageNicknames', 'ViewAuditLog'] },
  { key: 'srmod',      name: '🔷 Senior Moderator',   color: 0x3B82F6, hoist: true,
    perms: ['KickMembers', 'ModerateMembers', 'ManageMessages', 'ManageNicknames'] },
  { key: 'mod',        name: '🔧 Moderator',          color: 0x60A5FA, hoist: true,
    perms: ['ModerateMembers', 'ManageMessages'] },
  { key: 'trialmod',   name: '🧪 Trial Moderator',    color: 0x93C5FD, hoist: true,
    perms: ['ModerateMembers', 'ManageMessages'] },
  { key: 'support',    name: '🎧 Support Team',       color: 0x22D3EE, hoist: true, mentionable: true },

  // ── Whitelisted departments (top-level flags; full rank ladders are built
  //    per-department by /build-departments from DEPARTMENTS below) ──
  { key: 'dept_sast',     name: '🚔 State Troopers',      color: 0x2563EB, hoist: true, mentionable: true },
  { key: 'dept_ems',      name: '🚑 EMS / Fire',          color: 0xDC2626, hoist: true, mentionable: true },
  { key: 'dept_doj',      name: '⚖️ Department of Justice', color: 0x7C3AED, hoist: true, mentionable: true },
  { key: 'dept_mechanic', name: '🔧 Mechanic',            color: 0x64748B, hoist: true, mentionable: true },

  // ── Community ──
  { key: 'creator',    name: '🎬 Content Creator', color: 0xEC4899, hoist: true,  mentionable: true },
  { key: 'partner',    name: '🤝 Partner',         color: 0xA78BFA, hoist: true,  mentionable: false },
  { key: 'gangleader', name: '💀 Gang Leader',     color: 0x111827, hoist: true,  mentionable: true },
  { key: 'bizowner',   name: '💼 Business Owner',  color: 0x059669, hoist: true,  mentionable: true },
  { key: 'donator_gold',   name: '🥇 Gold Donator',   color: 0xFFD700, hoist: true },
  { key: 'donator_silver', name: '🥈 Silver Donator', color: 0xC0C0C0, hoist: true },
  { key: 'donator_bronze', name: '🥉 Bronze Donator', color: 0xCD7F32, hoist: true },
  { key: 'booster',    name: '💎 Server Booster',  color: 0xF472B6, hoist: true },
  { key: 'veteran',    name: '⏳ OG Citizen',      color: 0x9333EA, hoist: true },
  { key: 'whitelist',  name: '🎟️ Whitelisted',     color: 0x22C55E, hoist: true },
  { key: 'member',     name: '✅ Citizen',         color: 0x94A3B8 },
  { key: 'unverified', name: '🕓 Unverified',      color: 0x4B5563 },
  { key: 'muted',      name: '🔇 Muted',           color: 0x374151 },
];

// Notification roles — self-assignable from the /roles panel.
const PING_ROLES = [
  { key: 'p_announce', name: '📣 Announcements',  color: 0xFBBF24 },
  { key: 'p_updates',  name: '🧩 Server Updates', color: 0x38BDF8 },
  { key: 'p_restart',  name: '🔄 Restart Alerts', color: 0xF87171 },
  { key: 'p_events',   name: '🎉 Events',         color: 0x34D399 },
  { key: 'p_giveaway', name: '🎁 Giveaways',      color: 0xF59E0B },
  { key: 'p_live',     name: '🔴 Live Alerts',    color: 0x9146FF },
  { key: 'p_hiring',   name: '📢 Now Hiring',     color: 0x14B8A6 },
  { key: 'p_polls',    name: '🗳️ Polls',          color: 0xA3E635 },
];

// Interest roles — let people flag what they want to do in the city. Purely
// cosmetic/organisational, but they make the server feel alive and give staff a
// way to ping "everyone who wants to be police" when a department opens hiring.
const INTEREST_ROLES = [
  { key: 'i_leo',      name: '🚨 Interested: Law Enforcement', color: 0x2563EB },
  { key: 'i_ems',      name: '🩺 Interested: EMS / Fire',      color: 0xEF4444 },
  { key: 'i_doj',      name: '📜 Interested: Legal',           color: 0x8B5CF6 },
  { key: 'i_crime',    name: '🔫 Interested: Criminal RP',     color: 0x1F2937 },
  { key: 'i_business', name: '🏪 Interested: Business',        color: 0x10B981 },
  { key: 'i_racing',   name: '🏁 Interested: Racing',          color: 0xF97316 },
  { key: 'i_mc',       name: '🏍️ Interested: MC / Club',       color: 0x92400E },
];

// Activity-level reward roles, granted automatically (see events/messageCreate).
// Listed low→high; the bot keeps only the highest one a member has earned.
const LEVEL_ROLES = [
  { key: 'lvl5',   name: '🌱 Newcomer',   color: 0x9CA3AF, level: 5 },
  { key: 'lvl10',  name: '🏙️ Local',      color: 0x60A5FA, level: 10 },
  { key: 'lvl25',  name: '🌟 Regular',    color: 0xA78BFA, level: 25 },
  { key: 'lvl50',  name: '🔥 Legend',     color: 0xF472B6, level: 50 },
  { key: 'lvl100', name: '💠 City Icon',  color: 0xD4AF37, level: 100 },
];

// ── Channel blueprint ────────────────────────────────────────────────────────
// `visibility`:
//   'public'    — everyone can view (used for the front door)
//   'verified'  — hidden from @everyone/Unverified, visible to Citizen+
//   'whitelist' — in-character areas; Whitelisted + staff only
//   'staff'     — staff only
// `type`: 'text' | 'voice' | 'announcement' | 'forum' | 'stage'
// `readonly: true` — members can read but not send
// `topic` — channel description, shown under the channel name
const CATEGORIES = [
  {
    key: 'cat_info', name: '📌 ┃ INFORMATION', visibility: 'public',
    channels: [
      { key: 'welcome',   name: '👋・welcome',        type: 'text', readonly: true, topic: 'Welcome to Gatewood RP — start here.' },
      { key: 'rules',     name: '📜・rules',          type: 'text', readonly: true, topic: 'The Gatewood rulebook. Read it before you connect.' },
      { key: 'verify',    name: '🔓・verify',         type: 'text', readonly: true, topic: 'Accept the rules to unlock the city.' },
      { key: 'announce',  name: '📣・announcements',  type: 'announcement', readonly: true, topic: 'Official Gatewood RP announcements.' },
      { key: 'updates',   name: '🧩・server-updates', type: 'announcement', readonly: true, topic: 'Patch notes, new scripts and changelogs.' },
      { key: 'status',    name: '📊・server-status',  type: 'text', readonly: true, topic: 'Live player count and server health.' },
      { key: 'connect',   name: '🔗・how-to-connect', type: 'text', readonly: true, topic: 'How to install FiveM and join the city.' },
      { key: 'roles',     name: '🎭・get-roles',      type: 'text', readonly: true, topic: 'Pick your notification and interest roles.' },
      { key: 'staffteam', name: '👥・staff-team',     type: 'text', readonly: true, topic: 'Who runs Gatewood RP.' },
      { key: 'partners',  name: '🤝・partners',       type: 'text', readonly: true, topic: 'Our partnered communities and creators.' },
    ],
  },
  {
    key: 'cat_support', name: '🎫 ┃ SUPPORT & APPLICATIONS', visibility: 'public',
    channels: [
      { key: 'support',      name: '🎫・open-a-ticket',  type: 'text', readonly: true, topic: 'Support, reports, appeals and registrations — open a ticket here.' },
      { key: 'applications', name: '📋・applications',   type: 'text', readonly: true, topic: 'Whitelist, department, staff and creator applications.' },
      { key: 'faq',          name: '❓・faq',            type: 'text', readonly: true, topic: 'Answers to the questions we get most.' },
      { key: 'appeals_info', name: '⚖️・ban-appeals',    type: 'text', readonly: true, topic: 'Banned? Start your appeal here.' },
    ],
  },
  {
    key: 'cat_community', name: '💬 ┃ COMMUNITY', visibility: 'verified',
    channels: [
      // `aliases`: an existing channel matching one of these names is ADOPTED
      // (moved here and renamed) instead of recreated, preserving its history.
      { key: 'general',    name: '💬・general-chat', type: 'text',
        aliases: ['general', 'general-chat', 'gen-chat', 'main-chat', 'lobby', 'chat'] },
      { key: 'introduce',  name: '🙋・introductions', type: 'text', topic: 'New to the city? Say hello.' },
      { key: 'offtopic',   name: '🌀・off-topic',    type: 'text' },
      { key: 'memes',      name: '😂・memes',        type: 'text',
        aliases: ['meme', 'meme-dump', 'shitposting', 'shitpost'] },
      { key: 'clips',      name: '🎞️・clips',        type: 'text', topic: 'Drop your best Gatewood clips.' },
      { key: 'screenshots',name: '📸・screenshots',  type: 'text',
        aliases: ['media', 'photos', 'pictures', 'gallery'] },
      { key: 'highlights', name: '⭐・highlights',   type: 'text', readonly: true, topic: 'The community’s best moments (auto-collected).' },
      { key: 'suggest',    name: '💡・suggestions',  type: 'text', topic: 'Ideas for the city. Every post gets a vote.' },
      { key: 'polls',      name: '🗳️・polls',        type: 'text', readonly: true },
      { key: 'bots',       name: '🤖・bot-commands', type: 'text', topic: 'Spam the bot in here, not in general.' },
    ],
  },
  {
    key: 'cat_city', name: '🌆 ┃ IN CHARACTER', visibility: 'whitelist',
    channels: [
      { key: 'ic_twitter',   name: '🐦・twatter',          type: 'text', topic: 'IC social media. Everything posted here is in character.' },
      { key: 'ic_gram',      name: '📷・instaphoto',       type: 'text', topic: 'IC photo feed — characters only.' },
      { key: 'ic_news',      name: '📰・weazel-news',      type: 'text', readonly: true, topic: 'Official city news broadcasts.' },
      { key: 'ic_ads',       name: '📢・classifieds',      type: 'text', topic: 'IC ads — jobs, sales, services.' },
      { key: 'ic_business',  name: '🏪・business-directory', type: 'text', readonly: true, topic: 'Registered businesses in Gatewood.' },
      { key: 'ic_wanted',    name: '🚨・wanted-list',      type: 'text', readonly: true, topic: 'Persons of interest, published by law enforcement.' },
      { key: 'ic_lostfound', name: '🔍・lost-and-found',   type: 'text' },
      { key: 'ic_darkweb',   name: '🕸️・dark-web',         type: 'text', topic: 'IC only. Staff monitor this channel.' },
    ],
  },
  {
    key: 'cat_jobs', name: '🏛️ ┃ CITY & JOBS', visibility: 'verified',
    channels: [
      { key: 'hiring',      name: '📢・now-hiring',      type: 'text', readonly: true, topic: 'Departments and businesses currently recruiting.' },
      { key: 'dept_news',   name: '🏢・department-news', type: 'text', readonly: true },
      { key: 'orgs',        name: '💼・organisations',   type: 'text', readonly: true, topic: 'Registered gangs, MCs and businesses.' },
      { key: 'lfrp',        name: '🎭・looking-for-rp',  type: 'text', topic: 'Find scenes and storylines to join.' },
    ],
  },
  {
    key: 'cat_media', name: '🎥 ┃ MEDIA & CREATORS', visibility: 'verified',
    channels: [
      { key: 'golive',      name: '🔴・live-now',      type: 'text', readonly: true, topic: 'Gatewood creators currently streaming.' },
      { key: 'creator_info',name: '🎬・creator-info',  type: 'text', readonly: true, topic: 'How to become a Gatewood content creator.' },
      { key: 'creator_chat',name: '🎙️・creator-chat',  type: 'text', visibility: 'verified' },
    ],
  },
  {
    key: 'cat_events', name: '🎉 ┃ EVENTS & GIVEAWAYS', visibility: 'verified',
    channels: [
      { key: 'events',      name: '📅・events',        type: 'text', readonly: true, topic: 'City-wide events, races and meets.' },
      { key: 'giveaways',   name: '🎁・giveaways',     type: 'text', readonly: true },
      { key: 'event_chat',  name: '🗣️・event-chat',    type: 'text' },
    ],
  },
  {
    key: 'cat_voice', name: '🔊 ┃ VOICE', visibility: 'verified',
    channels: [
      { key: 'vc_create',   name: '➕・Create a Room', type: 'voice', topic: 'Join to spin up your own temporary voice room.' },
      { key: 'vc_1',        name: '🔊 Lounge 1',       type: 'voice' },
      { key: 'vc_2',        name: '🔊 Lounge 2',       type: 'voice' },
      { key: 'vc_3',        name: '🔊 Lounge 3',       type: 'voice' },
      { key: 'vc_stream',   name: '🎥 Streaming',      type: 'voice' },
      { key: 'vc_afk',      name: '💤 AFK',            type: 'voice' },
    ],
  },
  {
    key: 'cat_staff', name: '🛡️ ┃ STAFF', visibility: 'staff',
    channels: [
      { key: 'staff_chat',     name: '🗨️・staff-chat',        type: 'text' },
      { key: 'staff_announce', name: '📌・staff-announcements', type: 'text', readonly: true },
      { key: 'staff_cmds',     name: '⌨️・staff-commands',    type: 'text' },
      { key: 'reports',        name: '🚩・reports',           type: 'text', readonly: true, topic: 'In-game /report submissions land here.' },
      { key: 'app_review',     name: '📥・application-review', type: 'text', readonly: true },
      { key: 'ticket_logs',    name: '📁・ticket-logs',       type: 'text', readonly: true },
      { key: 'mod_logs',       name: '🔨・mod-logs',          type: 'text', readonly: true },
      { key: 'member_logs',    name: '🚪・member-logs',       type: 'text', readonly: true },
      { key: 'message_logs',   name: '📝・message-logs',      type: 'text', readonly: true },
      { key: 'voice_logs',     name: '🎙️・voice-logs',        type: 'text', readonly: true },
      { key: 'server_logs',    name: '🖥️・server-logs',       type: 'text', readonly: true, topic: 'Bot health, restarts and status changes.' },
      { key: 'ingame_feed',    name: '📡・in-game-feed',      type: 'text', readonly: true, topic: 'Live joins/leaves from FXServer (needs the bridge).' },
      { key: 'ingame_chat',    name: '💻・in-game-chat',      type: 'text', topic: 'Two-way relay with in-game chat (needs the bridge).' },
      { key: 'staff_vc',       name: '🛡️ Staff Voice',        type: 'voice' },
    ],
  },
];

// Voice channels used purely as live counters. Names are rewritten on a timer
// by src/tasks.js — `{n}` is substituted. Big servers use these to look busy at
// a glance; they cost one channel each and are locked so nobody can join.
const STAT_CHANNELS = [
  { key: 'stat_members', template: '👥・Members: {n}',  source: 'members' },
  { key: 'stat_players', template: '🏙️・In City: {n}',  source: 'players' },
  { key: 'stat_status',  template: '📶・Server: {n}',   source: 'status'  },
];
const STAT_CATEGORY = { key: 'cat_stats', name: '📈 ┃ SERVER STATS' };

// ── Departments ──────────────────────────────────────────────────────────────
// Each department gets its own locked category, a rank ladder of roles, and a
// full channel set — built by /build-departments. `scope` on a channel:
//   'all'      — every rank in the department
//   'announce' — everyone views, only command ranks post
//   'command'  — command ranks only (rank.command === true)
const DEPARTMENT_RANKS = {
  sast: [
    { key: 'colonel',   name: 'Colonel',            emoji: '⭐', color: 0x1E3A8A, command: true },
    { key: 'major',     name: 'Major',              emoji: '🎖️', color: 0x1D4ED8, command: true },
    { key: 'captain',   name: 'Captain',            emoji: '🏅', color: 0x2563EB, command: true },
    { key: 'lt',        name: 'Lieutenant',         emoji: '🔸', color: 0x3B82F6, command: true },
    { key: 'sgt',       name: 'Sergeant',           emoji: '🔹', color: 0x60A5FA },
    { key: 'corporal',  name: 'Corporal',           emoji: '▫️', color: 0x93C5FD },
    { key: 'senior',    name: 'Senior Trooper',     emoji: '🚔', color: 0xBFDBFE },
    { key: 'trooper',   name: 'Trooper',            emoji: '👮', color: 0xDBEAFE },
    { key: 'cadet',     name: 'Probationary Trooper', emoji: '🚸', color: 0xEFF6FF },
  ],
  ems: [
    { key: 'chief',     name: 'Chief of Medicine', emoji: '⭐', color: 0x7F1D1D, command: true },
    { key: 'deputy',    name: 'Deputy Chief',      emoji: '🎖️', color: 0x991B1B, command: true },
    { key: 'supervisor',name: 'Supervisor',        emoji: '🏅', color: 0xDC2626, command: true },
    { key: 'paramedic', name: 'Paramedic',         emoji: '🚑', color: 0xEF4444 },
    { key: 'emt',       name: 'EMT',               emoji: '🩺', color: 0xF87171 },
    { key: 'trainee',   name: 'Trainee',           emoji: '🚸', color: 0xFCA5A5 },
  ],
  doj: [
    { key: 'judge',     name: 'Chief Justice',     emoji: '⚖️', color: 0x4C1D95, command: true },
    { key: 'ag',        name: 'Attorney General',  emoji: '🏛️', color: 0x6D28D9, command: true },
    { key: 'da',        name: 'District Attorney', emoji: '📜', color: 0x7C3AED, command: true },
    { key: 'attorney',  name: 'Attorney',          emoji: '👔', color: 0xA78BFA },
    { key: 'clerk',     name: 'Court Clerk',       emoji: '🗂️', color: 0xC4B5FD },
  ],
  mechanic: [
    { key: 'owner',     name: 'Shop Owner',        emoji: '⭐', color: 0x334155, command: true },
    { key: 'manager',   name: 'Shop Manager',      emoji: '🎖️', color: 0x475569, command: true },
    { key: 'senior',    name: 'Senior Mechanic',   emoji: '🔧', color: 0x64748B },
    { key: 'mechanic',  name: 'Mechanic',          emoji: '🔩', color: 0x94A3B8 },
    { key: 'apprentice',name: 'Apprentice',        emoji: '🚸', color: 0xCBD5E1 },
  ],
};

const DEPARTMENT_CHANNELS = [
  { key: 'announcements', name: '📌・{slug}-announcements', type: 'text',  scope: 'announce' },
  { key: 'briefing',      name: '📋・briefings',           type: 'text',  scope: 'announce' },
  { key: 'chat',          name: '💬・{slug}-chat',         type: 'text',  scope: 'all' },
  { key: 'roster',        name: '👥・roster',              type: 'text',  scope: 'announce' },
  { key: 'sop',           name: '📖・sop-and-training',    type: 'text',  scope: 'announce' },
  { key: 'reports',       name: '🗒️・reports-and-logs',    type: 'text',  scope: 'all' },
  { key: 'requests',      name: '📨・requests',            type: 'text',  scope: 'all' },
  { key: 'command',       name: '🔒・command-staff',       type: 'text',  scope: 'command' },
  { key: 'promotions',    name: '📈・promotions',          type: 'text',  scope: 'command' },
  { key: 'vc_briefing',   name: '🎙️ Briefing Room',        type: 'voice', scope: 'all' },
  { key: 'vc_patrol',     name: '🚨 On Duty',              type: 'voice', scope: 'all' },
  { key: 'vc_command',    name: '🔒 Command',              type: 'voice', scope: 'command' },
];

// `roleKey` links a department to its top-level flag role in ROLES above, so
// members of any rank also appear under one hoisted department heading.
const DEPARTMENTS = [
  { key: 'sast',     name: 'San Andreas State Troopers',   short: 'SAST', slug: 'sast', emoji: '🚔', roleKey: 'dept_sast',     color: 0x2563EB },
  { key: 'ems',      name: 'EMS & Fire Department',        short: 'EMS',  slug: 'ems',  emoji: '🚑', roleKey: 'dept_ems',      color: 0xDC2626 },
  { key: 'doj',      name: 'Department of Justice',        short: 'DOJ',  slug: 'doj',  emoji: '⚖️', roleKey: 'dept_doj',      color: 0x7C3AED },
  { key: 'mechanic', name: 'Gatewood Customs',             short: 'Mechanic', slug: 'mechanic', emoji: '🔧', roleKey: 'dept_mechanic', color: 0x64748B },
];

// Order categories are sorted into by /organize. Anything not listed keeps its
// current position, below the listed ones.
const CATEGORY_ORDER = [
  '📌 ┃ INFORMATION',
  '📈 ┃ SERVER STATS',
  '🎫 ┃ SUPPORT & APPLICATIONS',
  '💬 ┃ COMMUNITY',
  '🌆 ┃ IN CHARACTER',
  '🏛️ ┃ CITY & JOBS',
  '🎥 ┃ MEDIA & CREATORS',
  '🎉 ┃ EVENTS & GIVEAWAYS',
  '🔊 ┃ VOICE',
];

// Every role key the bot treats as staff for permission checks.
const STAFF_KEYS = ['owner', 'coowner', 'management', 'developer', 'headadmin', 'admin', 'srmod', 'mod', 'trialmod'];
// Staff who can see and act on tickets (adds Support Team).
const TICKET_STAFF_KEYS = [...STAFF_KEYS, 'support'];
// Senior staff — the only ones who see staff-reports and can run destructive commands.
const SENIOR_KEYS = ['owner', 'coowner', 'management', 'headadmin'];

module.exports = {
  ROLES, PING_ROLES, INTEREST_ROLES, LEVEL_ROLES,
  CATEGORIES, STAT_CHANNELS, STAT_CATEGORY,
  DEPARTMENTS, DEPARTMENT_RANKS, DEPARTMENT_CHANNELS,
  CATEGORY_ORDER, STAFF_KEYS, TICKET_STAFF_KEYS, SENIOR_KEYS,
};
