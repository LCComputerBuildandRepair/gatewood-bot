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

const assert = require('assert');
const path = require('path');
const { PermissionFlagsBits: P } = require('discord.js');

const root = path.join(__dirname, '..');
const load = (m) => require(path.join(root, m));

const pass = (msg) => console.log(`  ✓ ${msg}`);
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

// ── Transcript ───────────────────────────────────────────────────────────────
{
  const transcript = load('src/transcript');
  assert.strictEqual(typeof transcript.build, 'function');
  assert.strictEqual(typeof transcript.collect, 'function');
  pass('transcript exports build/collect');
}

console.log('  ─────────────────────────────────────────');
console.log('\n  ✅ All logic tests passed.\n');
