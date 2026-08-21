'use strict';
/**
 * Component router — every button, select menu and modal in the bot.
 *
 * Custom ids follow `domain:action:arg`, so adding a feature means adding one
 * case here rather than growing a nest of if-statements in the event handler.
 */
const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  MessageFlags,
} = require('discord.js');

const db = require('./database');
const E = require('./utils/embeds');
const panels = require('./panels');
const appService = require('./services/appService');
const ticketService = require('./services/ticketService');
const { byKey: ticketByKey } = require('./tickets');
const { byKey: appByKey } = require('./applications');
const { PING_ROLES, INTEREST_ROLES } = require('./structure');
const { isStaff, hasRole, clamp, logTo, channelMention, ts } = require('./utils/helpers');

const EPH = MessageFlags.Ephemeral;

/** Entry point, called from events/interactionCreate.js. */
async function route(interaction) {
  const [domain, action, ...rest] = interaction.customId.split(':');
  const arg = rest.join(':');

  if (interaction.isButton()) return button(interaction, domain, action, arg, rest);
  if (interaction.isStringSelectMenu()) return select(interaction, domain, action, arg);
  if (interaction.isModalSubmit()) return modal(interaction, domain, action, arg, rest);
}

// ── Buttons ──────────────────────────────────────────────────────────────────
async function button(interaction, domain, action, arg, rest) {
  switch (`${domain}:${action}`) {
    case 'rules:open':      return showRulebook(interaction, parseInt(arg, 10) || 0);
    case 'rules:first':     return showRulebook(interaction, 0);
    case 'verify:accept':   return verify(interaction);
    case 'panel:jump':      return jump(interaction, arg);

    case 'ticket:claim':    return claimTicket(interaction);
    case 'ticket:close':    return promptClose(interaction);
    case 'ticket:transcript': return sendTranscript(interaction);

    case 'app:page':        return openAppPage(interaction, rest[0], parseInt(rest[1], 10) || 0);
    case 'app:accept':      return decideApp(interaction, arg, 'accepted');
    case 'app:deny':        return promptDecision(interaction, arg, 'denied');
    case 'app:interview':   return promptDecision(interaction, arg, 'interview');

    case 'give:enter':      return enterGiveaway(interaction, arg);

    default:
      return interaction.reply({ embeds: [E.error('Unknown button', 'This control is from an older version of the bot. Ask staff to re-post the panel.')], flags: EPH });
  }
}

// ── Select menus ─────────────────────────────────────────────────────────────
async function select(interaction, domain, action) {
  switch (`${domain}:${action}`) {
    case 'roles:ping':     return toggleRoles(interaction, PING_ROLES, 'notification');
    case 'roles:interest': return toggleRoles(interaction, INTEREST_ROLES, 'interest');
    case 'ticket:open':    return startTicket(interaction, interaction.values[0]);
    case 'app:start':      return startApplication(interaction, interaction.values[0]);
    default:
      return interaction.reply({ embeds: [E.error('Unknown menu', 'This menu is out of date. Ask staff to re-post the panel.')], flags: EPH });
  }
}

// ── Modals ───────────────────────────────────────────────────────────────────
async function modal(interaction, domain, action, arg, rest) {
  if (domain === 'appmodal') {
    // customId: appmodal:<appKey>:<pageIndex>
    return appService.handlePageSubmit(interaction, action, parseInt(arg, 10) || 0);
  }
  if (domain === 'ticketmodal') {
    return finishTicket(interaction, action);
  }
  if (domain === 'appdecide') {
    // customId: appdecide:<decision>:<appId>
    return finishDecision(interaction, action, rest.join(':'));
  }
  if (domain === 'ticketclose') {
    return finishClose(interaction);
  }
  return interaction.reply({ embeds: [E.error('Unknown form', 'That form is no longer handled.')], flags: EPH });
}

// ── Rulebook ─────────────────────────────────────────────────────────────────
async function showRulebook(interaction, page) {
  const payload = { ...panels.rulebookPage(page), flags: EPH };
  // Page-turning happens inside the member's own ephemeral message, so update
  // it in place rather than stacking a new reply for every page.
  const isEphemeralSource = interaction.message?.flags?.has(MessageFlags.Ephemeral);
  return isEphemeralSource
    ? interaction.update(panels.rulebookPage(page))
    : interaction.reply(payload);
}

async function jump(interaction, key) {
  const mention = channelMention(key);
  return interaction.reply({
    embeds: [E.info('Head over here', mention ? `Go to ${mention} and press the button there.` : 'That channel has not been set up yet — ask staff to run `/setup`.')],
    flags: EPH,
  });
}

// ── Verification ─────────────────────────────────────────────────────────────
async function verify(interaction) {
  // Defer first: role edits can outrun Discord's 3-second interaction window.
  await interaction.deferReply({ flags: EPH });

  const member = interaction.member;
  const memberRole = db.roleId('member');
  const unverified = db.roleId('unverified');
  const whitelistRole = db.roleId('whitelist');
  const openMode = db.get('whitelistMode', 'open') === 'open';

  if (!memberRole) {
    return interaction.editReply({ embeds: [E.error('Not set up yet', 'The Citizen role does not exist. Ask an admin to run `/setup`.')] });
  }
  if (member.roles.cache.has(memberRole)) {
    return interaction.editReply({ embeds: [E.info('Already verified', 'You are good to go — the whole server is already open to you.')] });
  }

  await member.roles.add(memberRole, 'Accepted the rules').catch(() => {});
  if (unverified && member.roles.cache.has(unverified)) {
    await member.roles.remove(unverified, 'Verified').catch(() => {});
  }

  // While the whitelist is open, verifying also grants city access so people
  // can connect immediately. Flip with `/config whitelist mode:application`.
  let gotWhitelist = false;
  if (openMode && whitelistRole) {
    await member.roles.add(whitelistRole, 'Whitelist open — auto-granted on verify').catch(() => {});
    gotWhitelist = true;
  }

  const next = gotWhitelist
    ? `You can connect right now — see ${channelMention('connect') || 'the connection guide'}.`
    : `Apply for city access in ${channelMention('applications') || 'the applications channel'}.`;

  await interaction.editReply({
    embeds: [E.success('Verified', `Welcome to **${interaction.guild.name}**.\n\n${next}\n\nGrab your notification roles in ${channelMention('roles') || 'the roles channel'}.`)],
  });

  await logTo(interaction.guild, 'member_logs', E.base(E.COLORS.success)
    .setTitle('🔓 Member verified')
    .setDescription(`<@${member.id}> (\`${member.user.tag}\`) accepted the rules.${gotWhitelist ? '\nWhitelist auto-granted (open mode).' : ''}`));
}

// ── Self-assign roles ────────────────────────────────────────────────────────
async function toggleRoles(interaction, defs, label) {
  await interaction.deferReply({ flags: EPH });

  const chosen = new Set(interaction.values);
  const added = [];
  const removed = [];

  for (const def of defs) {
    const id = db.roleId(def.key);
    if (!id) continue;
    const has = interaction.member.roles.cache.has(id);
    if (chosen.has(def.key) && !has) {
      await interaction.member.roles.add(id, `Self-assigned ${label} role`).catch(() => {});
      added.push(`<@&${id}>`);
    } else if (!chosen.has(def.key) && has) {
      await interaction.member.roles.remove(id, `Self-removed ${label} role`).catch(() => {});
      removed.push(`<@&${id}>`);
    }
  }

  const lines = [];
  if (added.length) lines.push(`**Added:** ${added.join(' ')}`);
  if (removed.length) lines.push(`**Removed:** ${removed.join(' ')}`);
  if (!lines.length) lines.push('No changes — you already had exactly those.');

  return interaction.editReply({ embeds: [E.success('Roles updated', lines.join('\n'))] });
}

// ── Tickets ──────────────────────────────────────────────────────────────────
async function startTicket(interaction, typeKey) {
  const type = ticketByKey(typeKey);
  if (!type) return interaction.reply({ embeds: [E.error('Unknown category', 'Pick another option.')], flags: EPH });

  const existing = db.openTicketFor(interaction.user.id, typeKey);
  if (existing) {
    return interaction.reply({
      embeds: [E.warn('You already have one open', `Continue in <#${existing}> — one ticket per issue, please.`)],
      flags: EPH,
    });
  }

  if (!type.questions?.length) return finishTicket(interaction, typeKey, {});

  const modalBuilder = new ModalBuilder()
    .setCustomId(`ticketmodal:${typeKey}`)
    .setTitle(clamp(type.label, 45));

  for (const q of type.questions) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(clamp(q.label, 45))
      .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false);
    if (q.max) input.setMaxLength(q.max);
    if (q.placeholder) input.setPlaceholder(clamp(q.placeholder, 100));
    modalBuilder.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return interaction.showModal(modalBuilder);
}

async function finishTicket(interaction, typeKey, preAnswers = null) {
  const type = ticketByKey(typeKey);
  if (!type) return interaction.reply({ embeds: [E.error('Unknown category', 'Pick another option.')], flags: EPH });

  await interaction.deferReply({ flags: EPH });

  const answers = preAnswers || {};
  if (!preAnswers) {
    for (const q of type.questions || []) {
      answers[q.id] = interaction.fields.getTextInputValue(q.id);
    }
  }

  try {
    const { channel, existed } = await ticketService.create(interaction.guild, interaction.member, typeKey, answers);
    return interaction.editReply({
      embeds: [existed
        ? E.warn('You already had one open', `Continue in <#${channel.id}>.`)
        : E.success('Ticket opened', `Your ticket is ready: <#${channel.id}>`)],
    });
  } catch (err) {
    console.error('[ticket] create failed:', err);
    return interaction.editReply({
      embeds: [E.error('Could not open the ticket', `\`${err.message}\`\nTell an admin — the bot probably needs **Manage Channels**.`)],
    });
  }
}

async function claimTicket(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Staff only', 'Only staff can claim tickets.')], flags: EPH });
  }
  const result = await ticketService.claim(interaction.channel, interaction.member);
  return interaction.reply({
    embeds: [result.ok ? E.success('Claimed', 'This ticket is yours.') : E.warn('Cannot claim', result.reason)],
    flags: EPH,
  });
}

async function promptClose(interaction) {
  const rec = db.getTicket(interaction.channel.id);
  if (!rec) return interaction.reply({ embeds: [E.error('Not a ticket', 'This channel is not a tracked ticket.')], flags: EPH });
  if (rec.ownerId !== interaction.user.id && !isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Not allowed', 'Only the ticket owner or staff can close this.')], flags: EPH });
  }

  const m = new ModalBuilder().setCustomId('ticketclose:reason').setTitle('Close this ticket');
  m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason / outcome')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(900)
      .setPlaceholder('Resolved, no action needed, player warned, …'),
  ));
  return interaction.showModal(m);
}

async function finishClose(interaction) {
  await interaction.deferReply({ flags: EPH });
  const reason = interaction.fields.getTextInputValue('reason') || 'No reason given';
  try {
    const count = await ticketService.close(interaction.channel, interaction.user, reason);
    return interaction.editReply({ embeds: [E.success('Ticket closing', `${count} messages archived. The channel deletes in 10 seconds.`)] });
  } catch (err) {
    console.error('[ticket] close failed:', err);
    return interaction.editReply({ embeds: [E.error('Close failed', `\`${err.message}\``)] });
  }
}

async function sendTranscript(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Staff only', 'Only staff can pull a transcript mid-ticket.')], flags: EPH });
  }
  await interaction.deferReply({ flags: EPH });
  const transcript = require('./transcript');
  const { file, count } = await transcript.build(interaction.channel, 'Mid-ticket snapshot');
  return interaction.editReply({ embeds: [E.success('Transcript ready', `${count} messages.`)], files: [file] });
}

// ── Applications ─────────────────────────────────────────────────────────────
async function startApplication(interaction, appKey) {
  const app = appByKey(appKey);
  if (!app) return interaction.reply({ embeds: [E.error('Unknown application', 'Pick another option.')], flags: EPH });

  if (!db.isAppOpen(appKey)) {
    return interaction.reply({
      embeds: [E.warn('Applications closed', `**${app.label}** applications are closed right now. Watch the announcements channel — we post when they reopen.`)],
      flags: EPH,
    });
  }

  // Block obvious duplicates: one pending application of a type at a time.
  const pending = db.userApplications(interaction.user.id)
    .find((a) => a.type === appKey && a.status === 'pending');
  if (pending) {
    return interaction.reply({
      embeds: [E.warn('Already pending', `Your **${app.label}** application (\`${pending.id}\`) is still being reviewed. You will be DM’d when it is decided.`)],
      flags: EPH,
    });
  }

  return interaction.showModal(appService.buildModal(app, 0));
}

async function openAppPage(interaction, appKey, pageIndex) {
  const app = appByKey(appKey);
  if (!app || !app.pages[pageIndex]) {
    return interaction.reply({ embeds: [E.error('Page not found', 'Start the application again.')], flags: EPH });
  }
  return interaction.showModal(appService.buildModal(app, pageIndex));
}

/** Accept goes straight through; deny/interview collect a reason first. */
async function decideApp(interaction, appId, decision) {
  const rec = db.getApplication(appId);
  if (!rec) return interaction.reply({ embeds: [E.error('Gone', 'That application no longer exists.')], flags: EPH });

  const app = appByKey(rec.type);
  if (!hasRole(interaction.member, app?.reviewKeys || [])) {
    return interaction.reply({ embeds: [E.error('Not your call', 'You are not on the review team for this application type.')], flags: EPH });
  }

  await interaction.deferReply({ flags: EPH });
  const result = await appService.decide(interaction, appId, decision, '');
  return interaction.editReply({
    embeds: [result.ok
      ? E.success('Decision recorded', `Application \`${appId}\` marked **${decision}**. The applicant has been DM’d.`)
      : E.warn('Nothing to do', result.reason)],
  });
}

async function promptDecision(interaction, appId, decision) {
  const rec = db.getApplication(appId);
  if (!rec) return interaction.reply({ embeds: [E.error('Gone', 'That application no longer exists.')], flags: EPH });

  const app = appByKey(rec.type);
  if (!hasRole(interaction.member, app?.reviewKeys || [])) {
    return interaction.reply({ embeds: [E.error('Not your call', 'You are not on the review team for this application type.')], flags: EPH });
  }

  const m = new ModalBuilder()
    .setCustomId(`appdecide:${decision}:${appId}`)
    .setTitle(decision === 'denied' ? 'Deny application' : 'Move to interview');
  m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel(decision === 'denied' ? 'Reason (the applicant sees this)' : 'Note for the applicant')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(decision === 'denied')
      .setMaxLength(900)
      .setPlaceholder(decision === 'denied'
        ? 'Be specific — vague denials just generate tickets.'
        : 'When and where you want to talk to them.'),
  ));
  return interaction.showModal(m);
}

async function finishDecision(interaction, decision, appId) {
  await interaction.deferReply({ flags: EPH });
  const reason = interaction.fields.getTextInputValue('reason') || '';
  const result = await appService.decide(interaction, appId, decision, reason);
  return interaction.editReply({
    embeds: [result.ok
      ? E.success('Decision recorded', `Application \`${appId}\` marked **${decision}**. The applicant has been DM’d.`)
      : E.warn('Nothing to do', result.reason)],
  });
}

// ── Giveaways ────────────────────────────────────────────────────────────────
async function enterGiveaway(interaction, msgId) {
  const g = db.getGiveaway(msgId);
  if (!g) return interaction.reply({ embeds: [E.error('Gone', 'That giveaway no longer exists.')], flags: EPH });
  if (g.ended) return interaction.reply({ embeds: [E.warn('Already ended', 'This one is over.')], flags: EPH });

  // Optional role gate, set with /giveaway start required_role:
  if (g.requiredRoleId && !interaction.member.roles.cache.has(g.requiredRoleId)) {
    return interaction.reply({ embeds: [E.error('Not eligible', `You need <@&${g.requiredRoleId}> to enter this one.`)], flags: EPH });
  }

  const entries = new Set(g.entries || []);
  let message;
  if (entries.has(interaction.user.id)) {
    entries.delete(interaction.user.id);
    message = 'You have **left** the giveaway.';
  } else {
    entries.add(interaction.user.id);
    message = `You are **in**. Winners are drawn ${ts(g.endsAt)}.`;
  }
  db.setGiveaway(msgId, { ...g, entries: [...entries] });

  // Keep the live entry count on the original message honest.
  try {
    const msg = interaction.message;
    const embed = msg.embeds[0];
    if (embed) {
      const rebuilt = E.base(E.COLORS.brand)
        .setTitle(embed.title)
        .setDescription(embed.description)
        .addFields(
          { name: 'Ends', value: ts(g.endsAt), inline: true },
          { name: 'Winners', value: String(g.winners || 1), inline: true },
          { name: 'Entries', value: String(entries.size), inline: true },
        );
      await msg.edit({ embeds: [rebuilt] });
    }
  } catch { /* cosmetic */ }

  return interaction.reply({ embeds: [E.success('Giveaway', message)], flags: EPH });
}

module.exports = { route };
