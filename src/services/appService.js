'use strict';
/**
 * Application lifecycle: modal pages → staff review → accept/deny/interview.
 *
 * Discord caps modals at 5 inputs, so longer applications are split into pages.
 * Partial answers live in memory between pages (a bot restart mid-application
 * just means the applicant starts over, which is acceptable and avoids writing
 * half-finished applications to disk).
 */
const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const panels = require('../panels');
const { byKey } = require('../applications');
const { channelByKey, clamp, ts, roleMention } = require('../utils/helpers');

// `${userId}:${appKey}` → { answers, at }
const drafts = new Map();
const DRAFT_TTL_MS = 60 * 60_000;

function draftKey(userId, appKey) { return `${userId}:${appKey}`; }

function getDraft(userId, appKey) {
  const d = drafts.get(draftKey(userId, appKey));
  if (!d) return {};
  if (Date.now() - d.at > DRAFT_TTL_MS) {
    drafts.delete(draftKey(userId, appKey));
    return {};
  }
  return d.answers;
}

function saveDraft(userId, appKey, answers) {
  drafts.set(draftKey(userId, appKey), { answers, at: Date.now() });
}

function clearDraft(userId, appKey) { drafts.delete(draftKey(userId, appKey)); }

/** Build the modal for one page of an application. */
function buildModal(app, pageIndex) {
  const page = app.pages[pageIndex];
  const modal = new ModalBuilder()
    .setCustomId(`appmodal:${app.key}:${pageIndex}`)
    .setTitle(clamp(`${app.label} (${pageIndex + 1}/${app.pages.length})`, 45));

  for (const q of page) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(clamp(q.label, 45))
      .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false);
    if (q.max) input.setMaxLength(q.max);
    if (q.min) input.setMinLength(q.min);
    if (q.placeholder) input.setPlaceholder(clamp(q.placeholder, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

/** "Continue to page N" button shown between modal pages. */
function continueRow(appKey, nextPage, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app:page:${appKey}:${nextPage}`)
      .setLabel(`Continue to part ${nextPage + 1} of ${total}`)
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Primary),
  );
}

/**
 * Handle a submitted modal page. Either returns a "continue" prompt or files
 * the finished application for review.
 */
async function handlePageSubmit(interaction, appKey, pageIndex) {
  const app = byKey(appKey);
  if (!app) return interaction.reply({ embeds: [E.error('Unknown application', 'That application no longer exists.')], flags: MessageFlags.Ephemeral });

  const answers = { ...getDraft(interaction.user.id, appKey) };
  for (const q of app.pages[pageIndex]) {
    answers[q.id] = interaction.fields.getTextInputValue(q.id);
  }
  saveDraft(interaction.user.id, appKey, answers);

  const nextPage = pageIndex + 1;
  if (nextPage < app.pages.length) {
    return interaction.reply({
      embeds: [E.success(
        `Part ${pageIndex + 1} saved`,
        `Nice work. Press the button below to open **part ${nextPage + 1} of ${app.pages.length}**.\n\n` +
        '> Your answers are held for one hour. If you close Discord before finishing, you start over.',
      )],
      components: [continueRow(appKey, nextPage, app.pages.length)],
      flags: MessageFlags.Ephemeral,
    });
  }

  return submit(interaction, app, answers);
}

/** File a completed application into the staff review channel. */
async function submit(interaction, app, answers) {
  const id = `${app.key}-${db.nextCounter('application')}`;
  db.setApplication(id, {
    userId: interaction.user.id,
    type: app.key,
    answers,
    status: 'pending',
    reviewer: null,
    at: Date.now(),
  });
  clearDraft(interaction.user.id, app.key);

  const embed = E.base(app.color)
    .setTitle(`${app.emoji} ${app.label} — \`${id}\``)
    .setDescription(`From <@${interaction.user.id}> (\`${interaction.user.tag}\`)\nSubmitted ${ts(Date.now())}`)
    .setThumbnail(interaction.user.displayAvatarURL());

  // Discord allows 25 fields; every application here is well under that.
  for (const page of app.pages) {
    for (const q of page) {
      if (answers[q.id]) embed.addFields({ name: clamp(q.label, 256), value: clamp(answers[q.id], 1024) });
    }
  }

  const member = interaction.member;
  const accountAge = ts(interaction.user.createdTimestamp, 'R');
  embed.addFields({
    name: '— Account checks —',
    value: `Joined the Discord ${member?.joinedTimestamp ? ts(member.joinedTimestamp) : '—'} • Account created ${accountAge}`,
  });

  const review = await channelByKey(interaction.guild, 'app_review');
  if (review?.isTextBased()) {
    await review.send({
      content: app.reviewKeys.map((k) => roleMention(k)).filter(Boolean).join(' ') || undefined,
      embeds: [embed],
      components: [panels.applicationReviewRow(id)],
      allowedMentions: { parse: ['roles'] },
    });
  }

  const reply = {
    embeds: [E.success(
      'Application submitted',
      `Your **${app.label}** application is in the queue as \`${id}\`.\n\n` +
      'You will get a **DM** the moment a decision is made — make sure your DMs are open to server members.',
    )],
    flags: MessageFlags.Ephemeral,
  };
  return interaction.replied || interaction.deferred
    ? interaction.followUp(reply)
    : interaction.reply({ ...reply, components: [] });
}

/**
 * Record a staff decision, grant roles, DM the applicant and update the review
 * message. `decision` is 'accepted' | 'denied' | 'interview'.
 */
async function decide(interaction, appId, decision, reason = '', reviewMessage = undefined) {
  const rec = db.getApplication(appId);
  if (!rec) return { ok: false, reason: 'That application no longer exists.' };
  if (rec.status !== 'pending' && decision !== 'interview') {
    return { ok: false, reason: `Already **${rec.status}** by <@${rec.reviewer}>.` };
  }

  const app = byKey(rec.type);
  const guild = interaction.guild;
  const applicant = await guild.members.fetch(rec.userId).catch(() => null);

  db.setApplication(appId, { ...rec, status: decision, reviewer: interaction.user.id, reason, decidedAt: Date.now() });

  // Grant the configured role on acceptance.
  let granted = null;
  if (decision === 'accepted' && app?.grants && applicant) {
    const roleId = db.roleId(app.grants);
    if (roleId) {
      await applicant.roles.add(roleId, `Application ${appId} accepted`).catch(() => {});
      granted = roleId;
    }
    // Accepting anyone also makes them a Citizen if they somehow aren't yet.
    const memberRole = db.roleId('member');
    if (memberRole && !applicant.roles.cache.has(memberRole)) {
      await applicant.roles.add(memberRole, 'Application accepted').catch(() => {});
    }
  }

  // DM the applicant.
  if (applicant) {
    const dm = {
      accepted: E.success(
        `Accepted — ${app?.label || 'Application'}`,
        `Congratulations. Your application to **${guild.name}** was **accepted** by ${interaction.user.tag}.` +
        (granted ? `\n\nYou have been given the <@&${granted}> role.` : '') +
        (reason ? `\n\n**Note from staff:** ${clamp(reason, 800)}` : ''),
      ),
      denied: E.error(
        `Denied — ${app?.label || 'Application'}`,
        `Your application to **${guild.name}** was **denied**.` +
        (reason ? `\n\n**Reason:** ${clamp(reason, 800)}` : '') +
        '\n\nYou may reapply after **7 days**. Read the reason carefully first — the same answers get the same result.',
      ),
      interview: E.info(
        `Interview — ${app?.label || 'Application'}`,
        `Your application to **${guild.name}** has moved to the **interview** stage.` +
        (reason ? `\n\n**Staff note:** ${clamp(reason, 800)}` : '') +
        '\n\nA member of the team will reach out to arrange a time.',
      ),
    }[decision];
    await applicant.send({ embeds: [dm] }).catch(() => { /* DMs closed */ });
  }

  // Update the review message in place so nobody double-handles it.
  const colors = { accepted: E.COLORS.success, denied: E.COLORS.error, interview: E.COLORS.info };
  const labels = { accepted: '✅ ACCEPTED', denied: '❌ DENIED', interview: '🎙️ INTERVIEW' };
  try {
    // `reviewMessage` lets /application decide run with no message attached.
    const msg = reviewMessage === undefined ? interaction.message : reviewMessage;
    if (msg) {
      const updated = E.base(colors[decision])
        .setTitle(`${labels[decision]} — ${app?.label || rec.type} \`${appId}\``)
        .setDescription(
          `Applicant: <@${rec.userId}>\n` +
          `Decision by <@${interaction.user.id}> ${ts(Date.now())}` +
          (reason ? `\n**Reason:** ${clamp(reason, 900)}` : '') +
          (applicant ? '' : '\n\n⚠️ *Applicant has left the server.*'),
        );
      const original = msg.embeds[0];
      if (original?.data?.fields) updated.addFields(original.data.fields.slice(0, 25));
      await msg.edit({ embeds: [updated], components: [] });
    }
  } catch { /* the review message may have been deleted */ }

  return { ok: true, decision, applicant };
}

module.exports = { buildModal, handlePageSubmit, submit, decide, getDraft, clearDraft, continueRow };
