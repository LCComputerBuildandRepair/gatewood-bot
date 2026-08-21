'use strict';
/**
 * /restart — the restart schedule and one-off countdowns.
 *
 * The schedule is a list of "HH:MM" times in the bot host's local timezone.
 * src/tasks.js announces 15, 5 and 1 minutes ahead of each, then again at the
 * hour, pinging the Restart Alerts role.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const { channelByKey, roleMention, ts } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Server restart schedule and announcements.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('schedule').setDescription('Set the daily restart times.')
      .addStringOption((o) => o.setName('times').setDescription('Comma-separated 24h times, e.g. 04:00,10:00,16:00,22:00').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show the current restart schedule.'))
    .addSubcommand((s) => s.setName('clear').setDescription('Turn off scheduled restart announcements.'))
    .addSubcommand((s) => s.setName('now').setDescription('Announce an unscheduled restart right now.')
      .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes until it happens (default 5)'))
      .addStringOption((o) => o.setName('reason').setDescription('Why'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'schedule') return schedule(interaction);
    if (sub === 'list') return list(interaction);
    if (sub === 'clear') return clear(interaction);
    if (sub === 'now') return now(interaction);
  },
};

async function schedule(interaction) {
  const raw = interaction.options.getString('times');
  const times = raw.split(',').map((t) => t.trim()).filter(Boolean);

  const bad = times.filter((t) => !TIME.test(t));
  if (bad.length) {
    return interaction.reply({
      embeds: [E.error('Bad times', `These are not valid 24-hour times: \`${bad.join('`, `')}\`\n\nUse the form \`04:00,10:00,16:00,22:00\`.`)],
      flags: EPH,
    });
  }

  // Normalise to zero-padded HH:MM so the tick comparison is exact.
  const normalised = [...new Set(times.map((t) => {
    const [h, m] = t.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }))].sort();

  db.setRestarts(normalised);
  return interaction.reply({
    embeds: [E.success('Restart schedule set',
      `**${normalised.join('** · **')}**\n\n` +
      `Announcements go to ${(await channelByKey(interaction.guild, 'announce'))?.toString() || 'the announcements channel'} at 15, 5 and 1 minutes before each, then at the time itself.\n\n` +
      '⚠️ These are the **bot host’s** local times — if the bot runs on a VPS in a different timezone, set them in that timezone.')],
    flags: EPH,
  });
}

async function list(interaction) {
  const times = db.getRestarts();
  return interaction.reply({
    embeds: [times.length
      ? E.info('Restart schedule', `**${times.join('** · **')}**\n\nHost time is currently **${new Date().toTimeString().slice(0, 5)}**.`)
      : E.info('No schedule', 'Nothing set. Add one with `/restart schedule`.')],
    flags: EPH,
  });
}

async function clear(interaction) {
  db.setRestarts([]);
  return interaction.reply({ embeds: [E.success('Schedule cleared', 'No more automatic restart announcements.')], flags: EPH });
}

async function now(interaction) {
  await interaction.deferReply({ flags: EPH });

  const minutes = Math.max(0, interaction.options.getInteger('minutes') ?? 5);
  const reason = interaction.options.getString('reason');
  const channel = await channelByKey(interaction.guild, 'announce') || interaction.channel;

  const embed = E.base(minutes === 0 ? E.COLORS.error : E.COLORS.warn)
    .setTitle(minutes === 0 ? '🔄 Restarting now' : `⏳ Unscheduled restart in ${minutes} minute${minutes === 1 ? '' : 's'}`)
    .setDescription(
      (reason ? `**Reason:** ${reason}\n\n` : '') +
      (minutes === 0
        ? 'The city is going down. Reconnect in about two minutes — your character is saved.'
        : `Wrap up your scenes and get somewhere safe. Back up around ${ts(Date.now() + minutes * 60_000, 't')}.`),
    );

  await channel.send({ content: roleMention('p_restart') || undefined, embeds: [embed] });
  return interaction.editReply({ embeds: [E.success('Announced', `Posted to <#${channel.id}>.`)] });
}
