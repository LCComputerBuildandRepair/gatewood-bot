'use strict';
/**
 * Ticket lifecycle: open → claim → close (with transcript).
 *
 * Each ticket type lives in its own category so a busy support queue never
 * buries a ban appeal. Categories are found-or-created by name, which keeps
 * this idempotent if someone renames or deletes one.
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const panels = require('../panels');
const transcript = require('../transcript');
const { byKey } = require('../tickets');
const { logTo, onlineStaffMention, dedupeOverwrites, clamp, ts } = require('../utils/helpers');

const P = PermissionFlagsBits;

/** Find (or create) the category a ticket type belongs in. */
async function ticketCategory(guild, type) {
  const stored = db.getId('categories', `ticketcat_${type.key}`);
  if (stored) {
    const c = guild.channels.cache.get(stored) || await guild.channels.fetch(stored).catch(() => null);
    if (c) return c;
  }
  let cat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === type.categoryName,
  );
  if (!cat) {
    cat = await guild.channels.create({
      name: type.categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [P.ViewChannel] }],
      reason: 'Gatewood tickets',
    });
  }
  db.setId('categories', `ticketcat_${type.key}`, cat.id);
  return cat;
}

/**
 * Create the ticket channel. `answers` is the map collected by the modal.
 * Returns the created channel, or null if the member already has one open.
 */
async function create(guild, member, typeKey, answers = {}) {
  const type = byKey(typeKey);
  if (!type) throw new Error(`Unknown ticket type '${typeKey}'`);

  const existing = db.openTicketFor(member.id, typeKey);
  if (existing) {
    const ch = guild.channels.cache.get(existing) || await guild.channels.fetch(existing).catch(() => null);
    if (ch) return { channel: ch, existed: true };
    db.deleteTicket(existing); // stale record, channel was deleted manually
  }

  const category = await ticketCategory(guild, type);
  const number = db.nextCounter('ticket');

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    {
      id: member.id,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks],
    },
  ];
  for (const key of type.staffKeys) {
    const id = db.roleId(key);
    if (id) {
      overwrites.push({
        id,
        allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageMessages],
      });
    }
  }

  const channel = await guild.channels.create({
    name: `${type.prefix}-${String(number).padStart(4, '0')}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `${type.label} • opened by ${member.user.tag} (${member.id})`,
    permissionOverwrites: dedupeOverwrites(overwrites),
    reason: `Ticket opened by ${member.user.tag}`,
  });

  db.setTicket(channel.id, {
    id: number,
    ownerId: member.id,
    type: typeKey,
    claimedBy: null,
    createdAt: Date.now(),
  });

  const embed = E.base(type.color)
    .setTitle(`${type.emoji} ${type.label} — #${String(number).padStart(4, '0')}`)
    .setDescription(
      `Opened by <@${member.id}> ${ts(Date.now())}\n\n` +
      'A member of the team will be with you shortly. Add anything else that helps — **clips and screenshots resolve tickets fastest**.',
    );

  for (const q of type.questions || []) {
    const value = answers[q.id];
    if (value) embed.addFields({ name: q.label, value: clamp(value, 1000) });
  }

  await channel.send({
    content: `<@${member.id}> ${onlineStaffMention(guild, type.staffKeys)}`,
    embeds: [embed],
    components: [panels.ticketControls()],
  });

  await logTo(guild, 'ticket_logs', E.base(type.color)
    .setTitle('🎫 Ticket opened')
    .addFields(
      { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
      { name: 'Type', value: type.label, inline: true },
      { name: 'Opened by', value: `<@${member.id}>`, inline: true },
    ));

  return { channel, existed: false };
}

/** Mark a ticket as claimed by a staff member. */
async function claim(channel, member) {
  const rec = db.getTicket(channel.id);
  if (!rec) return { ok: false, reason: 'This channel is not a ticket.' };
  if (rec.claimedBy) return { ok: false, reason: `Already claimed by <@${rec.claimedBy}>.` };

  // Same normalisation as close(): accept a User or a GuildMember.
  const claimer = member.user ?? member;

  db.setTicket(channel.id, { ...rec, claimedBy: member.id });
  await channel.send({ embeds: [E.success('Ticket claimed', `<@${member.id}> is handling this one.`)] });
  await channel.setTopic(`${channel.topic || ''} • claimed by ${claimer.tag}`).catch(() => {});
  return { ok: true };
}

/**
 * Close a ticket: render the transcript, file it in #ticket-logs, DM it to the
 * opener, then delete the channel. Returns the transcript message count.
 */
async function close(channel, closer, reason = 'No reason given') {
  const rec = db.getTicket(channel.id);
  const type = rec ? byKey(rec.type) : null;

  // `closer` may be a User (interaction.user) or a GuildMember. Both expose
  // `.id`, but only a member has `.user`, so normalise before reading the tag.
  const closerUser = closer.user ?? closer;

  await channel.send({
    embeds: [E.warn('Closing ticket', `Closed by <@${closer.id}>.\n**Reason:** ${clamp(reason, 500)}\n\nA transcript is on its way — this channel deletes in 10 seconds.`)],
  }).catch(() => {});

  const { file, count } = await transcript.build(
    channel,
    rec ? `Ticket #${String(rec.id).padStart(4, '0')} • ${type?.label || rec.type} • opened by ${rec.ownerId}` : '',
  );

  const summary = E.base(type?.color || E.COLORS.dark)
    .setTitle('📁 Ticket closed')
    .addFields(
      { name: 'Ticket', value: `#${channel.name}`, inline: true },
      { name: 'Type', value: type?.label || '—', inline: true },
      { name: 'Messages', value: String(count), inline: true },
      { name: 'Opened by', value: rec ? `<@${rec.ownerId}>` : '—', inline: true },
      { name: 'Claimed by', value: rec?.claimedBy ? `<@${rec.claimedBy}>` : 'Unclaimed', inline: true },
      { name: 'Closed by', value: `<@${closer.id}>`, inline: true },
      { name: 'Reason', value: clamp(reason, 1000) },
    );

  await logTo(channel.guild, 'ticket_logs', summary, { files: [file] });

  if (rec) {
    // Best-effort courtesy copy. Wrapped whole: a failure here must never
    // strand the ticket with its record deleted but its channel still standing.
    try {
      const owner = await channel.guild.members.fetch(rec.ownerId).catch(() => null);
      if (owner) {
        const { file: dmCopy } = await transcript.build(channel, 'Your ticket transcript');
        await owner.send({
          embeds: [E.info('Your ticket was closed', `**${type?.label || 'Ticket'}** — closed by ${closerUser.tag}.\n**Reason:** ${clamp(reason, 500)}\n\nYour transcript is attached.`)],
          files: [dmCopy],
        }).catch(() => { /* DMs closed */ });
      }
    } catch (err) {
      console.error('[ticket] could not DM the transcript:', err.message);
    }
    db.deleteTicket(channel.id);
  }

  setTimeout(() => channel.delete('Ticket closed').catch(() => {}), 10_000);
  return count;
}

module.exports = { create, claim, close, ticketCategory };
