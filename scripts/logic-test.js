'use strict';
/**
 * Unit tests for the pure logic — run with `npm test`.
 *
 * No token, no network, no Discord. These cover the functions that are easy to
 * get subtly wrong and impossible to notice until a member hits them: permission
 * merging, duration parsing, the XP curve, and the status embed.
 */
process.env.DISCORD_TOKEN ||= 'logictest';
process.env.CLIENT_ID ||= '000000000000000000';
process.env.GUILD_ID ||= '000000000000000000';
// Never let the tests touch the live store — the bot may be running.
process.env.GATEWOOD_DB ||= require('path').join(require('os').tmpdir(), 'gatewood-logic-test-db.json');

const assert = require('assert');
const path = require('path');
const { PermissionFlagsBits: P } = require('discord.js');

const root = path.join(__dirname, '..');
const load = (m) => require(path.join(root, m));

const pass = (msg) => console.log(`  ✓ ${msg}`);
// Checks that need await are queued here and drained at the end.
const asyncChecks = [];
console.log('\n  Gatewood bot — logic tests\n  ─────────────────────────────────────────');

// ── Permission overwrite merging ─────────────────────────────────────────────
const H = load('src/utils/helpers');
{
  const merged = H.dedupeOverwrites([
    { id: 'A', allow: [P.ViewChannel], deny: [P.SendMessages] },
    { id: 'A', allow: [P.SendMessages] },
    { id: 'B', deny: [P.ViewChannel] },
    { id: 'A' },
  ]);
  assert.strictEqual(merged.length, 2, 'duplicate ids collapse into one entry');
  const a = merged.find((o) => o.id === 'A');
  assert.ok(a.allow.includes(P.SendMessages), 'allows merge');
  assert.strictEqual(a.deny.length, 0, 'an explicit allow cancels the same deny');
  pass('dedupeOverwrites merges duplicates and lets allow win');
}

// ── Durations ────────────────────────────────────────────────────────────────
{
  assert.strictEqual(H.parseDuration('10m'), 600_000);
  assert.strictEqual(H.parseDuration('2h'), 7_200_000);
  assert.strictEqual(H.parseDuration('3d'), 259_200_000);
  assert.strictEqual(H.parseDuration('1w'), 604_800_000);
  assert.strictEqual(H.parseDuration('banana'), null);
  assert.strictEqual(H.parseDuration('10'), null, 'a bare number is rejected');
  assert.strictEqual(H.parseDuration(''), null);
  assert.strictEqual(H.parseDuration(null), null);
  pass('parseDuration accepts m/h/d/w and rejects junk');
}

// ── Small helpers ────────────────────────────────────────────────────────────
{
  assert.strictEqual(H.humanMinutes(75), '1h 15m');
  assert.strictEqual(H.humanMinutes(20), '20m');
  assert.strictEqual(H.humanMinutes(0), '0m');
  assert.strictEqual(H.slugify('The Lost MC!! '), 'the-lost-mc');
  assert.strictEqual(H.slugify('***'), 'unnamed', 'never produces an empty channel name');
  assert.strictEqual(H.clamp('abcdef', 4), 'abc…');
  assert.strictEqual(H.clamp(null, 10), '');
  assert.strictEqual(H.shuffle([1, 2, 3, 4, 5]).length, 5);
  pass('humanMinutes, slugify, clamp and shuffle');
}

// ── XP curve ─────────────────────────────────────────────────────────────────
{
  const { xpForLevel } = load('src/events/messageCreate');
  for (let i = 1; i < 100; i += 1) {
    assert.ok(xpForLevel(i + 1) > xpForLevel(i), `curve must increase at level ${i}`);
  }
  assert.ok(xpForLevel(0) === 0, 'level 0 costs nothing');
  pass(`XP curve is monotonic (level 10 = ${Math.round(xpForLevel(10))} XP, level 50 = ${Math.round(xpForLevel(50))} XP)`);
}

// ── Live status embed ────────────────────────────────────────────────────────
const fivem = load('src/fivem');
{
  const offline = fivem.statusEmbed({ online: false, players: 0, max: 64, list: [] }).toJSON();
  assert.ok(offline.title.includes('OFFLINE'), 'offline title');

  const online = fivem.statusEmbed({
    online: true, players: 47, max: 64, list: [{ ping: 40 }, { ping: 60 }], resources: 312,
  }).toJSON();
  assert.ok(online.title.includes('ONLINE'), 'online title');
  assert.ok(online.description.includes('47/64'), 'shows the player count');
  assert.ok(online.description.includes('73%'), 'shows the percentage');

  const full = fivem.statusEmbed({ online: true, players: 64, max: 64, list: [] }).toJSON();
  assert.ok(full.description.includes('queue active'), 'flags a queue at capacity');

  const disabled = fivem.statusEmbed({ disabled: true }).toJSON();
  assert.ok(disabled.title.includes('disabled'));

  assert.strictEqual(fivem.averagePing([{ ping: 40 }, { ping: 60 }]), 50);
  assert.strictEqual(fivem.averagePing([]), null);
  assert.strictEqual(fivem.stripColors('^2Gatewood ^7RP~r~'), 'Gatewood RP', 'strips FiveM colour codes');
  pass('status embed renders online, offline, full and disabled states');
}

// ── Modals ───────────────────────────────────────────────────────────────────
{
  const appService = load('src/services/appService');
  const { APPLICATIONS } = load('src/applications');
  let built = 0;
  for (const app of APPLICATIONS) {
    for (let i = 0; i < app.pages.length; i += 1) {
      const json = appService.buildModal(app, i).toJSON();
      assert.ok(json.title.length <= 45, `${app.key} modal title fits`);
      assert.ok(json.components.length <= 5, `${app.key} page ${i + 1} has at most 5 inputs`);
      assert.ok(json.custom_id.startsWith(`appmodal:${app.key}:`), 'custom id is routable');
      built += 1;
    }
  }
  pass(`${built} application modals build a valid payload`);
}

// ── Panels ───────────────────────────────────────────────────────────────────
{
  const panels = load('src/panels');
  const exported = ['welcomePanel', 'rulesPanel', 'rulebookPage', 'verifyPanel', 'rolesPanel',
    'ticketPanel', 'ticketControls', 'applicationsPanel', 'applicationReviewRow', 'faqPanel', 'connectPanel'];
  for (const name of exported) assert.strictEqual(typeof panels[name], 'function', `panels.${name}`);

  assert.strictEqual(panels.ticketPanel().components.length, 1, 'ticket panel has one select');
  assert.strictEqual(panels.rolesPanel().components.length, 2, 'roles panel has two selects');

  // Page-turn buttons must be disabled at the ends, not missing.
  const { RULEBOOK } = load('src/content');
  const first = panels.rulebookPage(0).components[0].toJSON();
  const last = panels.rulebookPage(RULEBOOK.length - 1).components[0].toJSON();
  assert.ok(first.components[0].disabled, 'Back is disabled on page 1');
  assert.ok(last.components[1].disabled, 'Next is disabled on the last page');
  // Out-of-range indexes clamp instead of throwing.
  assert.ok(panels.rulebookPage(-5).embeds[0].toJSON().title.includes('Chapter 1'));
  assert.ok(panels.rulebookPage(999).embeds[0].toJSON().title.includes(`Chapter ${RULEBOOK.length}`));
  pass('panels build, and rulebook paging clamps at both ends');
}

// ── Custom ids are unique within every message ───────────────────────────────
// Discord rejects a whole message if two components share a custom_id. This is
// easy to trip on paginated views, where the same target page can legitimately
// appear on two different buttons.
{
  const panels = load('src/panels');
  const { RULEBOOK } = load('src/content');

  const idsIn = (payload) => (payload.components || [])
    .flatMap((row) => (row.toJSON ? row.toJSON() : row).components || [])
    .map((c) => c.custom_id)
    .filter(Boolean);

  const checkUnique = (label, payload) => {
    const ids = idsIn(payload);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepStrictEqual(dupes, [], `${label} has duplicate custom ids: ${dupes.join(', ')}`);
  };

  checkUnique('welcomePanel', panels.welcomePanel());
  checkUnique('rulesPanel', panels.rulesPanel());
  checkUnique('verifyPanel', panels.verifyPanel());
  checkUnique('rolesPanel', panels.rolesPanel());
  checkUnique('ticketPanel', panels.ticketPanel());
  checkUnique('applicationsPanel', panels.applicationsPanel());
  checkUnique('ticketControls', { components: [panels.ticketControls()] });
  checkUnique('applicationReviewRow', { components: [panels.applicationReviewRow('whitelist-1')] });
  for (let i = 0; i < RULEBOOK.length; i += 1) checkUnique(`rulebookPage(${i})`, panels.rulebookPage(i));

  pass(`no duplicate custom ids across 8 panels and ${RULEBOOK.length} rulebook pages`);
}

// ── Every button id the panels emit has a route ──────────────────────────────
{
  const panels = load('src/panels');
  const { RULEBOOK } = load('src/content');
  const routed = new Set(['rules:open', 'rules:first', 'verify:accept', 'panel:jump',
    'ticket:claim', 'ticket:close', 'ticket:transcript',
    'app:page', 'app:accept', 'app:deny', 'app:interview', 'give:enter',
    'roles:ping', 'roles:interest', 'ticket:open', 'app:start']);

  const emitted = new Set();
  const collect = (payload) => {
    for (const row of payload.components || []) {
      for (const c of (row.toJSON ? row.toJSON() : row).components || []) {
        if (c.custom_id) emitted.add(c.custom_id.split(':').slice(0, 2).join(':'));
      }
    }
  };
  collect(panels.welcomePanel());
  collect(panels.verifyPanel());
  collect(panels.rolesPanel());
  collect(panels.ticketPanel());
  collect(panels.applicationsPanel());
  collect({ components: [panels.ticketControls()] });
  collect({ components: [panels.applicationReviewRow('whitelist-1')] });
  for (let i = 0; i < RULEBOOK.length; i += 1) collect(panels.rulebookPage(i));

  for (const id of emitted) {
    assert.ok(routed.has(id), `component "${id}" is emitted by a panel but has no route in components.js`);
  }
  pass(`all ${emitted.size} emitted component ids have a route`);
}

// ── Service exports the routers rely on ──────────────────────────────────────
{
  const ticketService = load('src/services/ticketService');
  const appService = load('src/services/appService');
  const tasks = load('src/tasks');
  const components = load('src/components');

  for (const k of ['create', 'claim', 'close', 'ticketCategory']) assert.strictEqual(typeof ticketService[k], 'function', `ticketService.${k}`);
  for (const k of ['buildModal', 'handlePageSubmit', 'submit', 'decide']) assert.strictEqual(typeof appService[k], 'function', `appService.${k}`);
  for (const k of ['start', 'stop', 'endGiveaway', 'tickStats']) assert.strictEqual(typeof tasks[k], 'function', `tasks.${k}`);
  assert.strictEqual(typeof components.route, 'function');
  pass('every function the routers call is exported');
}

// ── Ticket close ─────────────────────────────────────────────────────────────
// Both call sites hand close() an `interaction.user`, which is a User, not a
// GuildMember. Reading `.user.tag` off it threw partway through, leaving the
// ticket filed but never deleted. Drive the real function with real shapes.
{
  const { Collection } = require('@discordjs/collection');
  const db = load('src/database');
  const ticketService = load('src/services/ticketService');

  const makeChannel = (sent, dms) => {
    const messages = new Collection();
    messages.set('1', {
      id: '1', createdTimestamp: Date.now(), author: { tag: 'member#0001' },
      content: 'my game crashed', attachments: new Collection(), embeds: [],
    });
    return {
      id: 'chan-1',
      name: 'support-0001',
      topic: 'General Support',
      isTextBased: () => true,
      send: async (payload) => { sent.push(payload); return { id: 'm1' }; },
      delete: async () => {},
      messages: { fetch: async ({ before }) => (before ? new Collection() : messages) },
      guild: {
        id: 'guild-1',
        channels: { cache: new Collection(), fetch: async () => null },
        members: {
          fetch: async () => ({
            id: 'owner-1',
            send: async (payload) => { dms.push(payload); return { id: 'dm1' }; },
          }),
        },
      },
    };
  };

  const runClose = async (closer, label) => {
    const sent = [];
    const dms = [];
    const channel = makeChannel(sent, dms);
    db.setTicket(channel.id, { id: 7, ownerId: 'owner-1', type: 'support', claimedBy: null, createdAt: Date.now() });

    const count = await ticketService.close(channel, closer, 'resolved');

    assert.strictEqual(count, 1, `${label}: transcript captured the message`);
    assert.ok(sent.length >= 1, `${label}: posted the closing notice`);
    assert.strictEqual(db.getTicket(channel.id), undefined, `${label}: ticket record was deleted`);

    // The DM is where the User/GuildMember mixup blew up. close() catches its
    // own errors now, so asserting the ticket closed is not enough — the DM has
    // to have actually gone out, carrying the closer's tag.
    assert.strictEqual(dms.length, 1, `${label}: the owner was DM'd the transcript`);
    const body = dms[0].embeds[0].toJSON().description;
    assert.ok(body.includes('staff#0001'), `${label}: DM names the closer, got "${body}"`);
    assert.ok(dms[0].files?.length === 1, `${label}: DM carries the transcript file`);
  };

  asyncChecks.push(async () => {
    // A plain User, exactly what interaction.user gives you.
    await runClose({ id: 'staff-1', tag: 'staff#0001' }, 'closing as a User');
    // A GuildMember, in case a future call site passes one.
    await runClose({ id: 'staff-1', user: { tag: 'staff#0001' } }, 'closing as a GuildMember');
    pass('ticket close works with both a User and a GuildMember');
  });
}

// ── Join modes ───────────────────────────────────────────────────────────────
// autoJoinRoles=true must hand out Citizen + Whitelisted and never Unverified;
// false must do the opposite. Getting this backwards either locks everyone out
// or throws the gate open, and neither is obvious until members arrive.
{
  const db = load('src/database');
  const guildMemberAdd = load('src/events/guildMemberAdd');

  db.setId('roles', 'member', 'role-member');
  db.setId('roles', 'whitelist', 'role-whitelist');
  db.setId('roles', 'unverified', 'role-unverified');

  const makeMember = (added, removed) => ({
    id: 'newbie-1',
    user: { bot: false, tag: 'newbie#0001', createdTimestamp: Date.now() - 400 * 864e5, displayAvatarURL: () => null },
    joinedTimestamp: Date.now(),
    roles: {
      cache: { has: () => false },
      add: async (r) => { added.push(...[].concat(r)); },
      remove: async (r) => { removed.push(r); },
    },
    guild: {
      id: 'guild-1',
      memberCount: 101,
      channels: { cache: new Map(), fetch: async () => null },
    },
  });

  asyncChecks.push(async () => {
    const wasAuto = db.get('autoJoinRoles', false);
    const wasWelcome = db.get('welcomeEnabled', true);
    db.set('welcomeEnabled', false); // no welcome channel in these mocks

    try {
      db.set('autoJoinRoles', true);
      const added = [];
      await guildMemberAdd.execute(makeMember(added, []));
      assert.ok(added.includes('role-member'), 'auto mode grants Citizen');
      assert.ok(added.includes('role-whitelist'), 'auto mode grants Whitelisted');
      assert.ok(!added.includes('role-unverified'), 'auto mode must not add Unverified');

      db.set('autoJoinRoles', false);
      const added2 = [];
      await guildMemberAdd.execute(makeMember(added2, []));
      assert.deepStrictEqual(added2, ['role-unverified'], 'verify mode adds only Unverified');
    } finally {
      db.set('autoJoinRoles', wasAuto);
      db.set('welcomeEnabled', wasWelcome);
    }
    pass('join modes: auto grants Citizen + Whitelisted, verify gates on Unverified');
  });
}

// ── Retired channels ─────────────────────────────────────────────────────────
// The whole point of /slim is undone if /setup rebuilds what it removed, so
// the retire list has to survive and be reversible.
{
  const db = load('src/database');
  db.restoreChannel('ic_darkweb');

  assert.strictEqual(db.isRetired('ic_darkweb'), false, 'starts clean');
  db.retireChannel('ic_darkweb');
  assert.ok(db.isRetired('ic_darkweb'), 'retiring sticks');
  db.retireChannel('ic_darkweb');
  assert.strictEqual(db.retiredChannels().filter((k) => k === 'ic_darkweb').length, 1, 'no duplicates');
  db.restoreChannel('ic_darkweb');
  assert.strictEqual(db.isRetired('ic_darkweb'), false, 'restoring works');

  // A retired key must be one /setup actually knows about, or restore is a lie.
  const structure = load('src/structure');
  const blueprintKeys = new Set(structure.CATEGORIES.flatMap((c) => c.channels.map((ch) => ch.key)));
  assert.ok(blueprintKeys.has('ic_darkweb'), 'test key exists in the blueprint');
  pass('retire/restore is idempotent and reversible');
}

// ── Department channel budget ────────────────────────────────────────────────
// "Too many channels" is arithmetic, not taste. Keep it visible in the tests so
// a future addition has to be a deliberate choice.
{
  const s = load('src/structure');
  const perDept = s.DEPARTMENTS.map((d) =>
    s.DEPARTMENT_CHANNELS.length + (s.DEPARTMENT_EXTRA_CHANNELS[d.key] || []).length);
  const deptTotal = perDept.reduce((a, b) => a + b, 0);
  const mainTotal = s.CATEGORIES.reduce((a, c) => a + c.channels.length, 0);
  const grand = mainTotal + deptTotal + s.STAT_CHANNELS.length;

  for (const n of perDept) assert.ok(n <= 8, `a department should not need more than 8 channels, got ${n}`);
  assert.ok(grand <= 100, `blueprint builds ${grand} channels — over the 100 budget`);
  pass(`blueprint budget: ${mainTotal} main + ${deptTotal} department + ${s.STAT_CHANNELS.length} counters = ${grand}`);
}

// ── Transcript ───────────────────────────────────────────────────────────────
{
  const transcript = load('src/transcript');
  assert.strictEqual(typeof transcript.build, 'function');
  assert.strictEqual(typeof transcript.collect, 'function');
  pass('transcript exports build/collect');
}

// Drain the queued async checks. Nothing may report success before these run —
// a queued-but-never-awaited check would pass silently, which is worse than no
// test at all.
(async () => {
  const queued = asyncChecks.length;
  for (const check of asyncChecks) await check();
  if (queued === 0) throw new Error('async checks were registered but none ran');

  console.log('  ─────────────────────────────────────────');
  console.log('\n  ✅ All logic tests passed.\n');
})().catch((err) => {
  console.error(`\n  ❌ ${err.message}\n`);
  process.exit(1);
});
