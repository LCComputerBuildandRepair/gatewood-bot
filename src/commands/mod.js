'use strict';
/**
 * /mod — the full moderation suite. Every action is logged to #mod-logs and,
 * where it makes sense, DM'd to the member so they know what happened and why.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const { isStaff, isSenior, logTo, parseDuration, clamp, ts } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;
const P = PermissionFlagsBits;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools.')
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) => s.setName('warn').setDescription('Warn a member.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true)))
    .addSubcommand((s) => s.setName('warnings').setDescription('List a member’s warnings.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('delwarn').setDescription('Delete one warning by id.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addIntegerOption((o) => o.setName('id').setDescription('Warning id').setRequired(true)))
    .addSubcommand((s) => s.setName('clearwarns').setDescription('Clear all of a member’s warnings.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('note').setDescription('Add a private staff note (the member never sees it).')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('note').setDescription('The note').setRequired(true)))
    .addSubcommand((s) => s.setName('notes').setDescription('Read the staff notes on a member.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('timeout').setDescription('Time a member out.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 2h, 1d (max 28d)').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('untimeout').setDescription('Lift a timeout early.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('kick').setDescription('Kick a member.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true)))
    .addSubcommand((s) => s.setName('ban').setDescription('Ban a member.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true))
      .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete their last N days of messages (0–7)')))
    .addSubcommand((s) => s.setName('unban').setDescription('Unban a user id.')
      .addStringOption((o) => o.setName('user_id').setDescription('The user id').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('purge').setDescription('Bulk-delete recent messages in this channel.')
      .addIntegerOption((o) => o.setName('count').setDescription('How many (1–100)').setRequired(true))
      .addUserOption((o) => o.setName('from').setDescription('Only messages from this member')))
    .addSubcommand((s) => s.setName('slowmode').setDescription('Set slowmode on this channel.')
      .addIntegerOption((o) => o.setName('seconds').setDescription('0 to turn it off (max 21600)').setRequired(true)))
    .addSubcommand((s) => s.setName('lock').setDescription('Stop everyone posting in this channel.')
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('unlock').setDescription('Reopen this channel.')),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [E.error('Staff only', 'You are not on the staff team.')], flags: EPH });
    }

    const sub = interaction.options.getSubcommand();
    const handlers = {
      warn, warnings, delwarn, clearwarns, note, notes,
      timeout, untimeout, kick, ban, unban, purge, slowmode, lock, unlock,
    };
    return handlers[sub](interaction);
  },
};

/** Refuse to act on someone equal to or above the moderator in the hierarchy. */
async function guard(interaction, target) {
  if (!target) return 'That member is not in this server.';
  if (target.id === interaction.user.id) return 'You cannot use this on yourself.';
  if (target.id === interaction.guild.ownerId) return 'That is the server owner.';
  if (target.roles.highest.position >= interaction.member.roles.highest.position
      && interaction.user.id !== interaction.guild.ownerId) {
    return 'That member is the same rank as you or higher.';
  }
  if (target.roles.highest.position >= interaction.guild.members.me.roles.highest.position) {
    return 'That member is above me in the role list — I cannot act on them.';
  }
  return null;
}

async function modLog(interaction, title, target, fields = []) {
  await logTo(interaction.guild, 'mod_logs', E.base(E.COLORS.warn)
    .setTitle(title)
    .setThumbnail(target?.displayAvatarURL?.() || null)
    .addFields(
      { name: 'Member', value: target ? `<@${target.id}>\n\`${target.id}\`` : '—', inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'When', value: ts(Date.now()), inline: true },
      ...fields,
    ));
}

const dm = async (member, embed) => { await member?.send?.({ embeds: [embed] }).catch(() => {}); };

// ── warnings ─────────────────────────────────────────────────────────────────
async function warn(interaction) {
  const user = interaction.options.getUser('member');
  const reason = interaction.options.getString('reason');
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);

  const problem = await guard(interaction, target);
  if (problem) return interaction.reply({ embeds: [E.error('Cannot warn', problem)], flags: EPH });

  const id = db.nextCounter('warning');
  db.addWarning(user.id, { id, mod: interaction.user.id, reason, at: Date.now() });
  const total = db.getWarnings(user.id).length;

  await dm(target, E.warn(`Warning in ${interaction.guild.name}`,
    `**Reason:** ${reason}\n\nThis is warning **#${total}** on your record. Further warnings escalate to a timeout or a ban.`));

  await modLog(interaction, '⚠️ Member warned', user, [
    { name: 'Reason', value: clamp(reason, 1000) },
    { name: 'Total warnings', value: String(total), inline: true },
    { name: 'Warning id', value: String(id), inline: true },
  ]);

  return interaction.reply({
    embeds: [E.success('Warned', `<@${user.id}> warned (\`#${id}\`). They now have **${total}** warning${total === 1 ? '' : 's'}.`)],
    flags: EPH,
  });
}

async function warnings(interaction) {
  const user = interaction.options.getUser('member');
  const list = db.getWarnings(user.id);

  if (!list.length) {
    return interaction.reply({ embeds: [E.info('Clean record', `<@${user.id}> has no warnings.`)], flags: EPH });
  }

  const embed = E.base(E.COLORS.warn)
    .setTitle(`⚠️ Warnings for ${user.tag}`)
    .setDescription(`**${list.length}** on record.`)
    .setThumbnail(user.displayAvatarURL());

  for (const w of list.slice(-24)) {
    embed.addFields({ name: `#${w.id} — ${new Date(w.at).toLocaleDateString()}`, value: `${clamp(w.reason, 900)}\n— <@${w.mod}>` });
  }
  return interaction.reply({ embeds: [embed], flags: EPH });
}

async function delwarn(interaction) {
  const user = interaction.options.getUser('member');
  const id = interaction.options.getInteger('id');
  const removed = db.removeWarning(user.id, id);
  return interaction.reply({
    embeds: [removed
      ? E.success('Warning removed', `Deleted warning \`#${id}\` from <@${user.id}>.`)
      : E.error('Not found', `No warning \`#${id}\` on <@${user.id}>.`)],
    flags: EPH,
  });
}

async function clearwarns(interaction) {
  if (!isSenior(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Senior staff only', 'Clearing a whole record needs Head Admin or above.')], flags: EPH });
  }
  const user = interaction.options.getUser('member');
  const count = db.getWarnings(user.id).length;
  db.clearWarnings(user.id);
  await modLog(interaction, '🧹 Warnings cleared', user, [{ name: 'Removed', value: String(count), inline: true }]);
  return interaction.reply({ embeds: [E.success('Record cleared', `Removed **${count}** warnings from <@${user.id}>.`)], flags: EPH });
}

// ── notes ────────────────────────────────────────────────────────────────────
async function note(interaction) {
  const user = interaction.options.getUser('member');
  const text = interaction.options.getString('note');
  db.addNote(user.id, { mod: interaction.user.id, note: text, at: Date.now() });
  return interaction.reply({ embeds: [E.success('Note added', `Private note saved on <@${user.id}>.`)], flags: EPH });
}

async function notes(interaction) {
  const user = interaction.options.getUser('member');
  const list = db.getNotes(user.id);
  if (!list.length) return interaction.reply({ embeds: [E.info('No notes', `Nothing recorded on <@${user.id}>.`)], flags: EPH });

  const embed = E.base(E.COLORS.info).setTitle(`🗒️ Staff notes — ${user.tag}`);
  for (const n of list.slice(-24)) {
    embed.addFields({ name: new Date(n.at).toLocaleString(), value: `${clamp(n.note, 900)}\n— <@${n.mod}>` });
  }
  return interaction.reply({ embeds: [embed], flags: EPH });
}

// ── timeouts ─────────────────────────────────────────────────────────────────
async function timeout(interaction) {
  const user = interaction.options.getUser('member');
  const durationText = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason') || 'No reason given';
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);

  const problem = await guard(interaction, target);
  if (problem) return interaction.reply({ embeds: [E.error('Cannot time out', problem)], flags: EPH });

  const ms = parseDuration(durationText);
  if (!ms) return interaction.reply({ embeds: [E.error('Bad duration', 'Use a number and a unit: `10m`, `2h`, `1d`, `1w`.')], flags: EPH });
  if (ms > 28 * 864e5) return interaction.reply({ embeds: [E.error('Too long', 'Discord caps timeouts at 28 days.')], flags: EPH });

  await target.timeout(ms, `${reason} — by ${interaction.user.tag}`);
  await dm(target, E.warn(`Timed out in ${interaction.guild.name}`,
    `**Duration:** ${durationText}\n**Reason:** ${reason}\n\nYou can read but not post until it expires.`));
  await modLog(interaction, '⏳ Member timed out', user, [
    { name: 'Duration', value: durationText, inline: true },
    { name: 'Expires', value: ts(Date.now() + ms), inline: true },
    { name: 'Reason', value: clamp(reason, 1000) },
  ]);

  return interaction.reply({ embeds: [E.success('Timed out', `<@${user.id}> for **${durationText}**.`)], flags: EPH });
}

async function untimeout(interaction) {
  const user = interaction.options.getUser('member');
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!target) return interaction.reply({ embeds: [E.error('Not here', 'That member is not in the server.')], flags: EPH });

  await target.timeout(null, `Lifted by ${interaction.user.tag}`);
  await modLog(interaction, '✅ Timeout lifted', user);
  return interaction.reply({ embeds: [E.success('Timeout lifted', `<@${user.id}> can post again.`)], flags: EPH });
}

// ── kick / ban ───────────────────────────────────────────────────────────────
async function kick(interaction) {
  const user = interaction.options.getUser('member');
  const reason = interaction.options.getString('reason');
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);

  const problem = await guard(interaction, target);
  if (problem) return interaction.reply({ embeds: [E.error('Cannot kick', problem)], flags: EPH });

  await dm(target, E.error(`Kicked from ${interaction.guild.name}`,
    `**Reason:** ${reason}\n\nYou may rejoin, but a repeat gets you banned.`));
  await target.kick(`${reason} — by ${interaction.user.tag}`);
  await modLog(interaction, '👢 Member kicked', user, [{ name: 'Reason', value: clamp(reason, 1000) }]);

  return interaction.reply({ embeds: [E.success('Kicked', `<@${user.id}> — ${reason}`)], flags: EPH });
}

async function ban(interaction) {
  const user = interaction.options.getUser('member');
  const reason = interaction.options.getString('reason');
  const days = Math.max(0, Math.min(7, interaction.options.getInteger('delete_days') ?? 0));
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (target) {
    const problem = await guard(interaction, target);
    if (problem) return interaction.reply({ embeds: [E.error('Cannot ban', problem)], flags: EPH });
    await dm(target, E.error(`Banned from ${interaction.guild.name}`,
      `**Reason:** ${reason}\n\nIf you believe this is a mistake, you can appeal — rejoin the Discord if you are able, or contact staff.`));
  }

  await interaction.guild.members.ban(user.id, {
    reason: `${reason} — by ${interaction.user.tag}`,
    deleteMessageSeconds: days * 86400,
  });
  await modLog(interaction, '🔨 Member banned', user, [
    { name: 'Reason', value: clamp(reason, 1000) },
    { name: 'Messages deleted', value: `${days} day(s)`, inline: true },
  ]);

  return interaction.reply({ embeds: [E.success('Banned', `<@${user.id}> — ${reason}`)], flags: EPH });
}

async function unban(interaction) {
  const id = interaction.options.getString('user_id');
  const reason = interaction.options.getString('reason') || 'Appeal accepted';
  try {
    await interaction.guild.bans.remove(id, `${reason} — by ${interaction.user.tag}`);
  } catch (err) {
    return interaction.reply({ embeds: [E.error('Unban failed', `\`${err.message}\`\nCheck the id — that user may not be banned.`)], flags: EPH });
  }
  await modLog(interaction, '♻️ User unbanned', { id, displayAvatarURL: () => null }, [{ name: 'Reason', value: clamp(reason, 1000) }]);
  return interaction.reply({ embeds: [E.success('Unbanned', `\`${id}\` — ${reason}`)], flags: EPH });
}

// ── channel tools ────────────────────────────────────────────────────────────
async function purge(interaction) {
  const count = Math.max(1, Math.min(100, interaction.options.getInteger('count')));
  const from = interaction.options.getUser('from');
  await interaction.deferReply({ flags: EPH });

  const fetched = await interaction.channel.messages.fetch({ limit: 100 });
  const targets = [...fetched.values()]
    .filter((m) => !from || m.author.id === from.id)
    .filter((m) => Date.now() - m.createdTimestamp < 14 * 864e5) // Discord's bulk-delete limit
    .slice(0, count);

  if (!targets.length) {
    return interaction.editReply({ embeds: [E.warn('Nothing to delete', 'No matching messages under 14 days old.')] });
  }

  const deleted = await interaction.channel.bulkDelete(targets, true);
  await modLog(interaction, '🧹 Messages purged', null, [
    { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
    { name: 'Deleted', value: String(deleted.size), inline: true },
    ...(from ? [{ name: 'Filtered to', value: `<@${from.id}>`, inline: true }] : []),
  ]);

  return interaction.editReply({ embeds: [E.success('Purged', `Deleted **${deleted.size}** messages.`)] });
}

async function slowmode(interaction) {
  const seconds = Math.max(0, Math.min(21600, interaction.options.getInteger('seconds')));
  await interaction.channel.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`);
  return interaction.reply({
    embeds: [E.success('Slowmode updated', seconds ? `One message every **${seconds}s** in this channel.` : 'Slowmode off.')],
    flags: EPH,
  });
}

async function lock(interaction) {
  const reason = interaction.options.getString('reason') || 'No reason given';
  await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
  await interaction.reply({ embeds: [E.warn('Channel locked', `**Reason:** ${reason}\n\nStaff can still post.`)] });
  await modLog(interaction, '🔒 Channel locked', null, [
    { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
    { name: 'Reason', value: clamp(reason, 1000) },
  ]);
}

async function unlock(interaction) {
  await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
  await interaction.reply({ embeds: [E.success('Channel unlocked', 'Back to normal.')] });
  await modLog(interaction, '🔓 Channel unlocked', null, [{ name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }]);
}

