'use strict';
/**
 * /staff — on-duty tracking and shift hours.
 *
 * Members can see who is actually available before opening a ticket, and
 * leadership gets real numbers on who is putting the hours in.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const { isStaff, isSenior, humanMinutes, logTo, ts, clamp } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff duty tracking.')
    .addSubcommand((s) => s.setName('duty').setDescription('Go on or off duty.')
      .addBooleanOption((o) => o.setName('on').setDescription('On duty?').setRequired(true))
      .addStringOption((o) => o.setName('department').setDescription('What you are covering (e.g. tickets, in-game)')))
    .addSubcommand((s) => s.setName('online').setDescription('Who is on duty right now.'))
    .addSubcommand((s) => s.setName('hours').setDescription('Shift hours for a staff member.')
      .addUserOption((o) => o.setName('member').setDescription('Who (default: you)')))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Total shift hours across the staff team.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'online') return online(interaction);
    if (sub === 'hours') return hours(interaction);
    if (sub === 'leaderboard') return leaderboard(interaction);

    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [E.error('Staff only', 'Duty tracking is for the staff team.')], flags: EPH });
    }
    return duty(interaction);
  },
};

async function duty(interaction) {
  const on = interaction.options.getBoolean('on');
  const dept = interaction.options.getString('department') || 'general';
  const userId = interaction.user.id;

  if (on) {
    if (db.getShift(userId)) {
      return interaction.reply({ embeds: [E.warn('Already on duty', `You went on duty ${ts(db.getShift(userId).since)}.`)], flags: EPH });
    }
    db.startShift(userId, dept);
    await logTo(interaction.guild, 'staff_announce', E.base(E.COLORS.success)
      .setTitle('🟢 On duty')
      .setDescription(`<@${userId}> — **${clamp(dept, 100)}**`));
    return interaction.reply({ embeds: [E.success('On duty', `Clocked in for **${clamp(dept, 100)}**. Run \`/staff duty on:false\` when you finish.`)], flags: EPH });
  }

  const ended = db.endShift(userId);
  if (!ended) return interaction.reply({ embeds: [E.warn('Not on duty', 'You were not clocked in.')], flags: EPH });

  await logTo(interaction.guild, 'staff_announce', E.base(E.COLORS.dark)
    .setTitle('🔴 Off duty')
    .setDescription(`<@${userId}> — **${humanMinutes(ended.minutes)}** on ${clamp(ended.dept, 100)}`));

  return interaction.reply({
    embeds: [E.success('Off duty', `Shift logged: **${humanMinutes(ended.minutes)}**.\nTotal on record: **${humanMinutes(db.shiftTotals(userId))}**.`)],
    flags: EPH,
  });
}

async function online(interaction) {
  const shifts = Object.entries(db.onDuty());
  if (!shifts.length) {
    return interaction.reply({
      embeds: [E.info('Nobody on duty', 'No staff are clocked in right now. Open a ticket anyway — it gets picked up as soon as someone is back.')],
      flags: EPH,
    });
  }

  const lines = shifts
    .sort((a, b) => a[1].since - b[1].since)
    .map(([id, s]) => `🟢 <@${id}> — ${clamp(s.dept, 60)}, since ${ts(s.since)}`);

  return interaction.reply({
    embeds: [E.base(E.COLORS.success).setTitle('🛡️ Staff on duty').setDescription(lines.join('\n'))],
    flags: EPH,
  });
}

async function hours(interaction) {
  const user = interaction.options.getUser('member') || interaction.user;
  if (user.id !== interaction.user.id && !isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Staff only', 'You can only check your own hours.')], flags: EPH });
  }

  const log = db.all.shiftLog[user.id] || [];
  const total = db.shiftTotals(user.id);
  const week = log.filter((s) => Date.now() - s.end < 7 * 864e5).reduce((a, s) => a + s.minutes, 0);
  const current = db.getShift(user.id);

  return interaction.reply({
    embeds: [E.base(E.COLORS.info)
      .setTitle(`⏱️ Shift hours — ${user.tag}`)
      .addFields(
        { name: 'This week', value: humanMinutes(week), inline: true },
        { name: 'All time', value: humanMinutes(total), inline: true },
        { name: 'Shifts logged', value: String(log.length), inline: true },
        { name: 'Right now', value: current ? `🟢 On duty since ${ts(current.since)}` : '🔴 Off duty' },
      )],
    flags: EPH,
  });
}

async function leaderboard(interaction) {
  if (!isSenior(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Senior staff only', 'Hours across the whole team are for leadership.')], flags: EPH });
  }

  const log = db.all.shiftLog;
  const rows = Object.entries(log)
    .map(([id, shifts]) => ({
      id,
      total: shifts.reduce((a, s) => a + s.minutes, 0),
      week: shifts.filter((s) => Date.now() - s.end < 7 * 864e5).reduce((a, s) => a + s.minutes, 0),
    }))
    .sort((a, b) => b.week - a.week || b.total - a.total)
    .slice(0, 25);

  if (!rows.length) return interaction.reply({ embeds: [E.info('No shifts yet', 'Nobody has clocked in.')], flags: EPH });

  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((r, i) =>
    `${medals[i] || `\`${String(i + 1).padStart(2, ' ')}\``} <@${r.id}> — **${humanMinutes(r.week)}** this week · ${humanMinutes(r.total)} all time`);

  return interaction.reply({
    embeds: [E.base(E.COLORS.brand).setTitle('🏆 Staff activity').setDescription(clamp(lines.join('\n'), 3800))],
    flags: EPH,
  });
}
