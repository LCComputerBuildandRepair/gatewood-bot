'use strict';
/**
 * Offline self-test — run with `npm run check`.
 *
 * Loads every module, builds every slash command payload and validates it
 * against Discord's structural limits, without needing a token or a network
 * connection. Catches the class of mistake that otherwise only shows up as a
 * cryptic 400 at startup.
 */
process.env.DISCORD_TOKEN ||= 'selftest';
process.env.CLIENT_ID ||= '000000000000000000';
process.env.GUILD_ID ||= '000000000000000000';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const problems = [];
const note = (msg) => problems.push(msg);

// ── Modules load ─────────────────────────────────────────────────────────────
const modules = [
  'src/config', 'src/database', 'src/structure', 'src/content', 'src/applications',
  'src/tickets', 'src/panels', 'src/components', 'src/fivem', 'src/bridge',
  'src/tasks', 'src/twitch', 'src/automod', 'src/transcript',
  'src/utils/embeds', 'src/utils/helpers',
  'src/services/ticketService', 'src/services/appService',
];
for (const m of modules) {
  try { require(path.join(root, m)); } catch (err) { note(`module ${m}: ${err.message}`); }
}

// ── Commands ─────────────────────────────────────────────────────────────────
const commandDir = path.join(root, 'src', 'commands');
const commandFiles = fs.readdirSync(commandDir).filter((f) => f.endsWith('.js'));
const names = new Set();
let commandCount = 0;

for (const file of commandFiles) {
  let cmd;
  try {
    cmd = require(path.join(commandDir, file));
  } catch (err) {
    note(`command ${file}: failed to load — ${err.message}`);
    continue;
  }

  if (!cmd?.data?.toJSON || typeof cmd.execute !== 'function') {
    note(`command ${file}: missing data/execute`);
    continue;
  }

  let json;
  try {
    json = cmd.data.toJSON();
  } catch (err) {
    note(`command ${file}: toJSON failed — ${err.message}`);
    continue;
  }

  commandCount += 1;
  if (names.has(json.name)) note(`command ${file}: duplicate name "${json.name}"`);
  names.add(json.name);

  if (json.description && json.description.length > 100) note(`command ${json.name}: description over 100 chars`);

  // Options: 25 max per level, descriptions capped at 100 chars.
  const walk = (options, trail) => {
    if (!options) return;
    if (options.length > 25) note(`${trail}: ${options.length} options (max 25)`);
    for (const o of options) {
      if (o.description?.length > 100) note(`${trail}/${o.name}: description over 100 chars`);
      if (o.choices?.length > 25) note(`${trail}/${o.name}: ${o.choices.length} choices (max 25)`);
      for (const c of o.choices || []) {
        if (c.name.length > 100) note(`${trail}/${o.name}: choice name over 100 chars — "${c.name}"`);
      }
      walk(o.options, `${trail}/${o.name}`);
    }
  };
  walk(json.options, json.name);
}

// ── Events ───────────────────────────────────────────────────────────────────
const eventDir = path.join(root, 'src', 'events');
let eventCount = 0;
for (const file of fs.readdirSync(eventDir).filter((f) => f.endsWith('.js'))) {
  try {
    const evt = require(path.join(eventDir, file));
    if (!evt?.name || typeof evt.execute !== 'function') note(`event ${file}: missing name/execute`);
    else eventCount += 1;
  } catch (err) {
    note(`event ${file}: failed to load — ${err.message}`);
  }
}

// ── Blueprint sanity ─────────────────────────────────────────────────────────
const structure = require(path.join(root, 'src/structure'));
const { APPLICATIONS } = require(path.join(root, 'src/applications'));
const { TICKET_TYPES } = require(path.join(root, 'src/tickets'));

const roleKeys = new Set();
for (const r of [...structure.ROLES, ...structure.PING_ROLES, ...structure.INTEREST_ROLES, ...structure.LEVEL_ROLES]) {
  if (roleKeys.has(r.key)) note(`structure: duplicate role key "${r.key}"`);
  roleKeys.add(r.key);
  if (r.name.length > 100) note(`structure: role name over 100 chars — "${r.name}"`);
}

const channelKeys = new Set();
let channelCount = 0;
for (const cat of structure.CATEGORIES) {
  for (const ch of cat.channels) {
    channelCount += 1;
    if (channelKeys.has(ch.key)) note(`structure: duplicate channel key "${ch.key}"`);
    channelKeys.add(ch.key);
    if (ch.topic && ch.topic.length > 1024) note(`structure: topic too long on "${ch.key}"`);
  }
}

// Select menus cap at 25 options.
if (structure.PING_ROLES.length > 25) note('structure: more than 25 ping roles (select menu limit)');
if (structure.INTEREST_ROLES.length > 25) note('structure: more than 25 interest roles (select menu limit)');
if (TICKET_TYPES.length > 25) note('tickets: more than 25 ticket types (select menu limit)');
if (APPLICATIONS.length > 25) note('applications: more than 25 application types (select menu limit)');

// Modals cap at 5 inputs per page and 45 chars per label.
for (const app of APPLICATIONS) {
  for (const [i, page] of app.pages.entries()) {
    if (page.length > 5) note(`application ${app.key} page ${i + 1}: ${page.length} inputs (max 5)`);
    for (const q of page) {
      if (q.label.length > 45) note(`application ${app.key}: label over 45 chars — "${q.label}"`);
      if (q.style === 'paragraph' && q.max > 4000) note(`application ${app.key}/${q.id}: max over 4000`);
      if (q.style !== 'paragraph' && q.max > 4000) note(`application ${app.key}/${q.id}: max over 4000`);
    }
  }
  // Every role a decision grants must exist in the blueprint.
  if (app.grants && !roleKeys.has(app.grants)) note(`application ${app.key}: grants unknown role key "${app.grants}"`);
  for (const k of app.reviewKeys) {
    if (!roleKeys.has(k)) note(`application ${app.key}: reviewKey "${k}" is not a blueprint role`);
  }
}

for (const t of TICKET_TYPES) {
  if ((t.questions || []).length > 5) note(`ticket ${t.key}: ${t.questions.length} questions (max 5)`);
  for (const q of t.questions || []) {
    if (q.label.length > 45) note(`ticket ${t.key}: label over 45 chars — "${q.label}"`);
  }
  for (const k of t.staffKeys) {
    if (!roleKeys.has(k)) note(`ticket ${t.key}: staffKey "${k}" is not a blueprint role`);
  }
}

// Departments must reference a real flag role and have at least one command rank.
for (const d of structure.DEPARTMENTS) {
  if (d.roleKey && !roleKeys.has(d.roleKey)) note(`department ${d.key}: roleKey "${d.roleKey}" is not a blueprint role`);
  const ranks = structure.DEPARTMENT_RANKS[d.key];
  if (!ranks?.length) note(`department ${d.key}: no ranks defined`);
  else if (!ranks.some((r) => r.command)) note(`department ${d.key}: no rank marked command:true`);
}

// Panels must build without throwing.
const panels = require(path.join(root, 'src/panels'));
for (const name of ['welcomePanel', 'rulesPanel', 'verifyPanel', 'rolesPanel', 'ticketPanel', 'applicationsPanel', 'faqPanel', 'connectPanel']) {
  try {
    const built = panels[name]();
    if (!built.embeds?.length) note(`panel ${name}: produced no embed`);
    for (const e of built.embeds) {
      const json = e.toJSON ? e.toJSON() : e;
      if (json.description && json.description.length > 4096) note(`panel ${name}: description over 4096 chars`);
    }
  } catch (err) {
    note(`panel ${name}: threw — ${err.message}`);
  }
}
for (let i = 0; i < require(path.join(root, 'src/content')).RULEBOOK.length; i += 1) {
  try {
    const page = panels.rulebookPage(i);
    const json = page.embeds[0].toJSON();
    if (json.description.length > 4096) note(`rulebook page ${i + 1}: over 4096 chars`);
  } catch (err) {
    note(`rulebook page ${i + 1}: threw — ${err.message}`);
  }
}

// ── Source encoding ──────────────────────────────────────────────────────────
// Editing these files with a tool that reads UTF-8 as ANSI (PowerShell 5.1's
// Get-Content without -Encoding UTF8 is the classic offender) silently mangles
// every emoji, and Discord then rejects the buttons with COMPONENT_INVALID_EMOJI.
// Cheaper to catch it here than in a member's face.
{
  // Built from escapes rather than written literally, so this file does not
  // trip its own check: U+FFFD, plus the byte pairs UTF-8 emoji decay into
  // when they are read back as Windows-1252.
  const MOJIBAKE = new RegExp('\uFFFD|\u00C3[\u0080-\u00BF]|\u00E2\u20AC|\u00F0\u009F');
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scan(full);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.lua')) {
        const text = fs.readFileSync(full, 'utf8');
        if (MOJIBAKE.test(text)) {
          note(`encoding: ${path.relative(root, full)} contains mangled characters — it was saved with the wrong encoding. Restore it from a clean copy.`);
        }
      }
    }
  };
  scan(root);
}

// ── Report ───────────────────────────────────────────────────────────────────
// Per-department, because departments can carry extra channels of their own.
const deptChannels = structure.DEPARTMENTS.reduce((sum, d) =>
  sum + structure.DEPARTMENT_CHANNELS.length + (structure.DEPARTMENT_EXTRA_CHANNELS[d.key] || []).length, 0);
const deptRoles = Object.values(structure.DEPARTMENT_RANKS).reduce((a, r) => a + r.length, 0);

console.log('');
console.log('  Gatewood bot — self test');
console.log('  ─────────────────────────────────────────');
console.log(`  Commands         ${commandCount}`);
console.log(`  Events           ${eventCount}`);
console.log(`  Blueprint roles  ${roleKeys.size}  (+${deptRoles} department ranks)`);
console.log(`  Categories       ${structure.CATEGORIES.length}  (+${structure.DEPARTMENTS.length} departments)`);
console.log(`  Channels         ${channelCount}  (+${deptChannels} department, +${structure.STAT_CHANNELS.length} counters)`);
console.log(`  Applications     ${APPLICATIONS.length}`);
console.log(`  Ticket types     ${TICKET_TYPES.length}`);
console.log('  ─────────────────────────────────────────');

if (problems.length) {
  console.log(`\n  ❌ ${problems.length} problem(s):\n`);
  for (const p of problems) console.log(`     • ${p}`);
  console.log('');
  process.exit(1);
}

console.log('\n  ✅ Everything checks out.\n');
