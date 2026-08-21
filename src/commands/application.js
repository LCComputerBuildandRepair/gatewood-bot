'use strict';
/**
 * /application — staff-side review tooling: look one up, list what's pending,
 * and decide without hunting for the original review message.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const appService = require('../services/appService');
const { APPLICATIONS, byKey } = require('../applications');
const { isStaff, hasRole, clamp, ts } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('application')
    .setDescription('Review applications.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('pending').setDescription('Everything waiting for a decision.')
      .addStringOption((o) => o.setName('type').setDescription('Filter by type')
        .addChoices(...APPLICATIONS.map((a) => ({ name: a.label, value: a.key })))))
    .addSubcommand((s) => s.setName('view').setDescription('Read one application in full.')
      .addStringOption((o) => o.setName('id').setDescription('Application id, e.g. whitelist-12').setRequired(true)))
    .addSubcommand((s) => s.setName('decide').setDescription('Accept or deny an application by id.')
      .addStringOption((o) => o.setName('id').setDescription('Application id').setRequired(true))
      .addStringOption((o) => o.setName('decision').setDescription('What you decided').setRequired(true).addChoices(
        { name: 'accept', value: 'accepted' },
        { name: 'deny', value: 'denied' },
        { name: 'move to interview', value: 'interview' },
      ))
      .addStringOption((o) => o.setName('reason').setDescription('Shown to the applicant')))
    .addSubcommand((s) => s.setName('history').setDescription('Every application from one member.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [E.error('Staff only', 'Application review is a staff tool.')], flags: EPH });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'pending') return pending(interaction);
    if (sub === 'view') return view(interaction);
    if (sub === 'decide') return decide(interaction);
    if (sub === 'history') return history(interaction);
  },
};

async function pending(interaction) {
  await interaction.deferReply({ flags: EPH });

  const filter = interaction.options.getString('type');
  const all = Object.entries(db.all.applications)
    .map(([id, a]) => ({ id, ...a }))
    .filter((a) => a.status === 'pending')
    .filter((a) => !filter || a.type === filter)
    .sort((a, b) => a.at - b.at);

  if (!all.length) {
    return interaction.editReply({ embeds: [E.success('Queue is clear', 'Nothing is waiting for a decision.')] });
  }

  const lines = all.slice(0, 25).map((a) => {
    const app = byKey(a.type);
    const waiting = Math.round((Date.now() - a.at) / 3600000);
    const flag = waiting > 48 ? ' ⚠️' : '';
    return `${app?.emoji || '📋'} \`${a.id}\` — <@${a.userId}> · ${ts(a.at)}${flag}`;
  });

  return interaction.editReply({
    embeds: [E.base(E.COLORS.warn)
      .setTitle(`📥 ${all.length} pending application${all.length === 1 ? '' : 's'}`)
      .setDescription(clamp(lines.join('\n'), 3800))
      .setFooter({ text: '⚠️ = waiting over 48 hours • read one with /application view', iconURL: E.getBrandIcon() || undefined })],
  });
}

async function view(interaction) {
  await interaction.deferReply({ flags: EPH });

  const id = interaction.options.getString('id').trim();
  const rec = db.getApplication(id);
  if (!rec) return interaction.editReply({ embeds: [E.error('Not found', `No application with the id \`${id}\`.`)] });

  const app = byKey(rec.type);
  const embed = E.base(app?.color || E.COLORS.info)
    .setTitle(`${app?.emoji || '📋'} ${app?.label || rec.type} — \`${id}\``)
    .setDescription(
      `Applicant: <@${rec.userId}>\nSubmitted ${ts(rec.at)}\nStatus: **${rec.status}**` +
      (rec.reviewer ? ` by <@${rec.reviewer}>` : '') +
      (rec.reason ? `\n**Reason:** ${clamp(rec.reason, 500)}` : ''),
    );

  for (const page of app?.pages || []) {
    for (const q of page) {
      if (rec.answers[q.id]) embed.addFields({ name: clamp(q.label, 256), value: clamp(rec.answers[q.id], 1024) });
    }
  }
  return interaction.editReply({ embeds: [embed] });
}

async function decide(interaction) {
  await interaction.deferReply({ flags: EPH });

  const id = interaction.options.getString('id').trim();
  const decision = interaction.options.getString('decision');
  const reason = interaction.options.getString('reason') || '';

  const rec = db.getApplication(id);
  if (!rec) return interaction.editReply({ embeds: [E.error('Not found', `No application with the id \`${id}\`.`)] });

  const app = byKey(rec.type);
  if (!hasRole(interaction.member, app?.reviewKeys || [])) {
    return interaction.editReply({ embeds: [E.error('Not your call', 'You are not on the review team for this application type.')] });
  }
  if (decision === 'denied' && !reason) {
    return interaction.editReply({ embeds: [E.error('Reason required', 'Denials need a reason — the applicant sees it, and vague denials just turn into tickets.')] });
  }

  // Pass an explicit null review message — there is none when deciding by id.
  const result = await appService.decide(interaction, id, decision, reason, null);
  return interaction.editReply({
    embeds: [result.ok
      ? E.success('Decision recorded', `\`${id}\` marked **${decision}**. The applicant has been DM’d.`)
      : E.warn('Nothing to do', result.reason)],
  });
}

async function history(interaction) {
  const user = interaction.options.getUser('member');
  const apps = db.userApplications(user.id).sort((a, b) => b.at - a.at);

  if (!apps.length) {
    return interaction.reply({ embeds: [E.info('Nothing on file', `<@${user.id}> has never applied for anything.`)], flags: EPH });
  }

  const icons = { pending: '🕓', accepted: '✅', denied: '❌', interview: '🎙️' };
  const lines = apps.slice(0, 25).map((a) =>
    `${icons[a.status] || '•'} \`${a.id}\` — ${byKey(a.type)?.label || a.type} · ${ts(a.at)}`);

  return interaction.reply({
    embeds: [E.base(E.COLORS.info)
      .setTitle(`📚 Application history — ${user.tag}`)
      .setDescription(clamp(lines.join('\n'), 3800))],
    flags: EPH,
  });
}
