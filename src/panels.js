'use strict';
/**
 * Panel builders — the interactive messages the bot posts into channels.
 *
 * Every custom id follows `domain:action:arg` so events/interactionCreate.js can
 * route it without a giant switch. Panels are re-postable at any time with
 * /panel <name>.
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');

const config = require('./config');
const E = require('./utils/embeds');
const db = require('./database');
const { RULEBOOK, WELCOME, FAQ, CONNECT_STEPS } = require('./content');
const { APPLICATIONS } = require('./applications');
const { TICKET_TYPES } = require('./tickets');
const { PING_ROLES, INTEREST_ROLES } = require('./structure');
const { channelMention, clamp } = require('./utils/helpers');

// ── Welcome ──────────────────────────────────────────────────────────────────
function welcomePanel() {
  const links = [];
  if (config.websiteUrl) links.push(`🌐 [Website](${config.websiteUrl})`);
  if (config.storeUrl) links.push(`🛒 [Store](${config.storeUrl})`);
  if (config.connectUrl) links.push(`🔗 [Connect](${config.connectUrl})`);

  const embed = E.base(E.COLORS.brand)
    .setTitle(WELCOME.title)
    .setDescription(WELCOME.intro)
    .addFields(
      { name: 'Getting started', value: WELCOME.steps.join('\n') },
      ...(links.length ? [{ name: 'Links', value: links.join('   •   ') }] : []),
    )
    .setFooter({ text: WELCOME.footerNote, iconURL: E.getBrandIcon() || undefined });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rules:open:0').setLabel('Read the Rulebook').setEmoji('📜').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel:jump:verify').setLabel('Verify Me').setEmoji('🔓').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

// ── Rules ────────────────────────────────────────────────────────────────────
function rulesPanel() {
  const embed = E.base(E.COLORS.brand)
    .setTitle('📜 The Gatewood Rulebook')
    .setDescription(
      `**${RULEBOOK.length} chapters.** Every one of them applies to you the moment you connect.\n\n` +
      'Open the book below to read it page by page — it opens privately, so nobody else sees you flipping through it.\n\n' +
      RULEBOOK.map((c, i) => `\`${String(i + 1).padStart(2, '0')}\`  ${c.title.replace(/^Chapter \d+ — /, '')}`).join('\n'),
    )
    .setFooter({ text: 'Not knowing a rule has never been a defence.', iconURL: E.getBrandIcon() || undefined });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rules:open:0').setLabel('Open the Rulebook').setEmoji('📖').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

/** One page of the rulebook — rendered ephemerally with page-turn buttons. */
function rulebookPage(index) {
  const i = Math.max(0, Math.min(RULEBOOK.length - 1, index));
  const chapter = RULEBOOK[i];
  const embed = E.base(E.COLORS.brand)
    .setTitle(chapter.title)
    .setDescription(clamp(chapter.body.join('\n\n'), 4000))
    .setFooter({ text: `Page ${i + 1} of ${RULEBOOK.length}`, iconURL: E.getBrandIcon() || undefined });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rules:open:${i - 1}`).setLabel('Back').setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary).setDisabled(i === 0),
    new ButtonBuilder().setCustomId(`rules:open:${i + 1}`).setLabel('Next').setEmoji('▶️')
      .setStyle(ButtonStyle.Primary).setDisabled(i === RULEBOOK.length - 1),
    // Needs an id of its own: on page 2 the Back button is also 'rules:open:0',
    // and Discord rejects any message carrying two identical custom ids.
    new ButtonBuilder().setCustomId('rules:first').setLabel('First page').setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary).setDisabled(i === 0),
  );
  return { embeds: [embed], components: [row] };
}

// ── Verify ───────────────────────────────────────────────────────────────────
function verifyPanel() {
  const mode = db.get('whitelistMode', 'open');
  const after = mode === 'application'
    ? `Once you are verified, apply for city access in ${channelMention('applications') || 'the applications channel'}.`
    : 'Verifying unlocks the whole server **and** city access — the whitelist is currently open.';

  const embed = E.base(E.COLORS.success)
    .setTitle('🔓 Verify Yourself')
    .setDescription(
      'Press the button below to confirm you have **read and accepted the rulebook**.\n\n' +
      `${after}\n\n` +
      '> By verifying you agree that every rule in the rulebook applies to you, and that not having read them is not a defence.',
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify:accept').setLabel('I accept the rules').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rules:open:0').setLabel('Read them first').setEmoji('📖').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

// ── Self-assign roles ────────────────────────────────────────────────────────
function rolesPanel() {
  const embed = E.base(E.COLORS.accent)
    .setTitle('🎭 Pick Your Roles')
    .setDescription(
      '**Notifications** — choose what you want pinged for. Nothing else will ping you.\n' +
      '**Interests** — tell us what you want to do in Gatewood so we can ping you when it opens up.\n\n' +
      'Select to add, deselect to remove. You can change these any time.',
    );

  const pingSelect = new StringSelectMenuBuilder()
    .setCustomId('roles:ping')
    .setPlaceholder('🔔 Notification roles')
    .setMinValues(0)
    .setMaxValues(PING_ROLES.length)
    .addOptions(PING_ROLES.map((r) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(r.name.replace(/^\S+\s/, ''))
        .setValue(r.key)
        .setEmoji(r.name.split(' ')[0])));

  const interestSelect = new StringSelectMenuBuilder()
    .setCustomId('roles:interest')
    .setPlaceholder('🎯 What do you want to do in the city?')
    .setMinValues(0)
    .setMaxValues(INTEREST_ROLES.length)
    .addOptions(INTEREST_ROLES.map((r) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(r.name.replace(/^\S+\s/, ''))
        .setValue(r.key)
        .setEmoji(r.name.split(' ')[0])));

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(pingSelect),
      new ActionRowBuilder().addComponents(interestSelect),
    ],
  };
}

// ── Tickets ──────────────────────────────────────────────────────────────────
function ticketPanel() {
  const embed = E.base(E.COLORS.accent)
    .setTitle('🎫 Open a Ticket')
    .setDescription(
      'Pick the category that fits and a **private channel** opens for you and the right team.\n\n' +
      TICKET_TYPES.map((t) => `${t.emoji} **${t.label}** — ${t.description}`).join('\n') +
      '\n\n> Reports and appeals go a lot faster with a clip attached.',
    )
    .setFooter({ text: 'One ticket per issue. Duplicates get closed.', iconURL: E.getBrandIcon() || undefined });

  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket:open')
    .setPlaceholder('Select a ticket category…')
    .addOptions(TICKET_TYPES.map((t) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(t.label)
        .setValue(t.key)
        .setDescription(clamp(t.description, 90))
        .setEmoji(t.emoji)));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

/** In-ticket control bar, posted as the first message of every ticket channel. */
function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
  );
}

// ── Applications ─────────────────────────────────────────────────────────────
function applicationsPanel() {
  const mode = db.get('whitelistMode', 'open');
  const wl = mode === 'application'
    ? '🎟️ **The whitelist is ON** — you need an approved application before you can connect.'
    : '🎟️ **The whitelist is currently OPEN** — verifying in Discord is enough to connect. Departments and organisations still apply below.';

  const embed = E.base(E.COLORS.brand)
    .setTitle('📋 Applications')
    .setDescription(
      `${wl}\n\n` +
      APPLICATIONS.map((a) => {
        const closed = db.isAppOpen(a.key) ? '' : '  *(closed)*';
        return `${a.emoji} **${a.label}**${closed}\n> ${a.description}`;
      }).join('\n') +
      '\n\n> Take your time — low-effort applications are denied on sight. You will be DM’d the decision, so keep your DMs open.',
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId('app:start')
    .setPlaceholder('Choose what to apply for…')
    .addOptions(APPLICATIONS.map((a) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(a.label)
        .setValue(a.key)
        .setDescription(clamp(a.description, 90))
        .setEmoji(a.emoji)));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

/** Staff review controls attached to a submitted application. */
function applicationReviewRow(appId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app:accept:${appId}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app:deny:${appId}`).setLabel('Deny').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`app:interview:${appId}`).setLabel('Interview').setEmoji('🎙️').setStyle(ButtonStyle.Primary),
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
function faqPanel() {
  const embed = E.base(E.COLORS.info)
    .setTitle('❓ Frequently Asked Questions')
    .setDescription(FAQ.map((f) => `**${f.q}**\n> ${f.a}`).join('\n\n'));
  return { embeds: [embed] };
}

// ── Connection guide ─────────────────────────────────────────────────────────
function connectPanel() {
  const embed = E.base(E.COLORS.accent)
    .setTitle('🔗 How to Connect to Gatewood')
    .setDescription(CONNECT_STEPS.join('\n\n'));

  const fields = [];
  if (config.connectUrl) fields.push({ name: 'Direct connect', value: `\`${config.connectUrl}\`` });
  if (config.server.cfxCode) fields.push({ name: 'cfx.re link', value: `https://cfx.re/join/${config.server.cfxCode}` });
  if (!config.connectUrl && !config.server.cfxCode) {
    fields.push({ name: 'Direct connect', value: 'Set `CONNECT_URL` or `CFX_CODE` in the bot’s `.env` to show it here.' });
  }
  embed.addFields(fields);

  const row = new ActionRowBuilder();
  if (config.server.cfxCode) {
    row.addComponents(new ButtonBuilder().setLabel('Join the City').setEmoji('🚗')
      .setStyle(ButtonStyle.Link).setURL(`https://cfx.re/join/${config.server.cfxCode}`));
  }
  if (config.storeUrl) {
    row.addComponents(new ButtonBuilder().setLabel('Store').setEmoji('🛒')
      .setStyle(ButtonStyle.Link).setURL(config.storeUrl));
  }
  return row.components.length ? { embeds: [embed], components: [row] } : { embeds: [embed] };
}

module.exports = {
  welcomePanel, rulesPanel, rulebookPage, verifyPanel, rolesPanel,
  ticketPanel, ticketControls, applicationsPanel, applicationReviewRow,
  faqPanel, connectPanel,
};
