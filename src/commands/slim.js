'use strict';
/**
 * /slim — shrink the server without losing anything anyone said.
 *
 * Two rules, enforced in code rather than by care:
 *   1. A channel that has ever been posted in is NEVER deleted. It gets moved
 *      into a read-only archive category instead, so the history stays
 *      readable and stops taking up a slot in the active sidebar.
 *   2. Channels the bot writes to (logs, panels, status) are never touched
 *      automatically, because "empty" for those means "nothing has happened
 *      yet", not "unused".
 *
 * Defaults to a preview. Nothing changes until you pass confirm:CONFIRM.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const { clamp, dedupeOverwrites } = require('../utils/helpers');
const { STAFF_KEYS } = require('../structure');

const EPH = MessageFlags.Ephemeral;
const P = PermissionFlagsBits;
const DAY = 864e5;

const ARCHIVE_CATEGORY = '🗄️ ┃ ARCHIVE';

// Same list /audit uses: channels the bot itself depends on.
const BOT_MANAGED = new Set([
  'welcome', 'rules', 'verify', 'announce', 'updates', 'status', 'roles',
  'support', 'applications', 'faq', 'connect',
  'highlights', 'golive', 'giveaways', 'suggest',
  'app_review', 'reports', 'ticket_logs', 'mod_logs', 'member_logs',
  'message_logs', 'voice_logs', 'server_logs', 'ingame_feed', 'ingame_chat',
  'stat_members', 'stat_players', 'stat_status', 'vc_create',
]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slim')
    .setDescription('Delete never-used channels and archive quiet ones. Never deletes anything with messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((o) => o.setName('quiet_days')
      .setDescription('Archive channels with no messages in this many days (0 = do not archive, default 45)'))
    .addStringOption((o) => o.setName('also')
      .setDescription('Extra channels to archive regardless of activity — #mentions or names, comma separated'))
    .addStringOption((o) => o.setName('keep')
      .setDescription('Channels to leave alone no matter what — #mentions or names, comma separated'))
    .addStringOption((o) => o.setName('archive_visibility')
      .setDescription('Who can still read archived channels (default: members)')
      .addChoices(
        { name: 'members — everyone keeps read-only access to the history', value: 'members' },
        { name: 'staff — hide the archive from members entirely', value: 'staff' },
      ))
    .addStringOption((o) => o.setName('confirm')
      .setDescription('Type CONFIRM to actually apply the plan')),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const guild = interaction.guild;
    const quietDays = interaction.options.getInteger('quiet_days') ?? 45;
    const confirmed = interaction.options.getString('confirm') === 'CONFIRM';
    const visibility = interaction.options.getString('archive_visibility') || 'members';

    await guild.channels.fetch();

    const keyById = new Map();
    for (const [key, id] of Object.entries(db.allIds('channels'))) keyById.set(id, key);

    const forceArchive = parseChannelList(guild, interaction.options.getString('also'));
    const forceKeep = parseChannelList(guild, interaction.options.getString('keep'));
    const orgCategoryIds = new Set(db.listOrgs().map((o) => o.categoryId).filter(Boolean));

    // ── Work out the plan ──
    const toDelete = [];
    const toArchive = [];
    const skipped = [];

    const textish = [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement);

    for (const ch of textish) {
      const key = keyById.get(ch.id);

      if (forceKeep.has(ch.id)) { skipped.push([ch, 'you asked me to keep it']); continue; }
      if (db.getTicket(ch.id)) { skipped.push([ch, 'open ticket']); continue; }
      if (orgCategoryIds.has(ch.parentId)) { skipped.push([ch, 'belongs to an organisation']); continue; }
      if (ch.parent?.name === ARCHIVE_CATEGORY) { skipped.push([ch, 'already archived']); continue; }

      const last = await lastMessageAt(ch);

      // Rule 1: history is never deleted, only ever moved.
      if (last === null) {
        if (BOT_MANAGED.has(key)) { skipped.push([ch, 'empty, but the bot posts here']); continue; }
        toDelete.push(ch);
        continue;
      }

      if (forceArchive.has(ch.id)) { toArchive.push([ch, 'you listed it']); continue; }
      if (BOT_MANAGED.has(key)) { skipped.push([ch, 'the bot posts here']); continue; }
      if (quietDays > 0 && Date.now() - last > quietDays * DAY) {
        toArchive.push([ch, `no messages in ${Math.floor((Date.now() - last) / DAY)} days`]);
      }
    }

    // Categories that would be left with nothing in them.
    const emptyCategories = [...guild.channels.cache.values()].filter((c) => {
      if (c.type !== ChannelType.GuildCategory) return false;
      if (c.name === ARCHIVE_CATEGORY || orgCategoryIds.has(c.id)) return false;
      const children = guild.channels.cache.filter((x) => x.parentId === c.id);
      const going = new Set([...toDelete.map((x) => x.id), ...toArchive.map(([x]) => x.id)]);
      return children.size > 0 && children.every((x) => going.has(x.id));
    });

    // ── Preview ──
    if (!confirmed) {
      const embed = E.base(E.COLORS.warn)
        .setTitle('🧹 Slim-down plan — nothing changed yet')
        .setDescription(
          `**${toDelete.length}** to delete · **${toArchive.length}** to archive · **${skipped.length}** left alone\n\n` +
          'Re-run with `confirm:CONFIRM` to apply.',
        )
        .addFields(
          {
            name: `🗑️ Delete — never posted in (${toDelete.length})`,
            value: clamp(toDelete.map((c) => `#${c.name}`).join(', ') || '_none_', 1000),
          },
          {
            name: `🗄️ Archive — has history, goes read-only (${toArchive.length})`,
            value: clamp(toArchive.map(([c, why]) => `#${c.name} — *${why}*`).join('\n') || '_none_', 1000),
          },
          {
            name: `🛟 Left alone (${skipped.length})`,
            value: clamp(skipped.map(([c, why]) => `#${c.name} — *${why}*`).join('\n') || '_none_', 1000),
          },
        );

      if (emptyCategories.length) {
        embed.addFields({
          name: `📁 Categories that end up empty (${emptyCategories.length})`,
          value: clamp(emptyCategories.map((c) => c.name).join('\n'), 1000),
        });
      }
      embed.setFooter({
        text: 'Nothing with messages in it is ever deleted — only moved.',
        iconURL: E.getBrandIcon() || undefined,
      });
      return interaction.editReply({ embeds: [embed] });
    }

    // ── Apply ──
    let deleted = 0;
    let archived = 0;
    let catsRemoved = 0;
    const failures = [];

    const archiveCat = toArchive.length ? await ensureArchive(guild, visibility) : null;

    for (const ch of toDelete) {
      // Belt and braces: re-check emptiness immediately before deleting, in
      // case someone posted while the plan was being previewed.
      const stillEmpty = (await lastMessageAt(ch)) === null;
      if (!stillEmpty) { failures.push(`#${ch.name} — someone posted since the preview, left it alone`); continue; }
      const key = keyById.get(ch.id);
      if (await ch.delete('Slim-down: never used').then(() => true).catch(() => false)) {
        deleted += 1;
        // Remember the decision so the next /setup does not recreate it.
        if (key) { db.retireChannel(key); db.clearId('channels', key); }
      } else failures.push(`#${ch.name} — could not delete`);
    }

    for (const [ch] of toArchive) {
      const ok = await ch.setParent(archiveCat.id, { lockPermissions: true })
        .then(() => true).catch(() => false);
      if (!ok) { failures.push(`#${ch.name} — could not move`); continue; }
      // Read-only for everyone; the history stays, the conversation stops.
      await ch.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false,
      }).catch(() => {});
      const key = keyById.get(ch.id);
      if (key) db.retireChannel(key);
      archived += 1;
    }

    for (const cat of emptyCategories) {
      const stillEmpty = guild.channels.cache.filter((x) => x.parentId === cat.id).size === 0;
      if (stillEmpty && await cat.delete('Slim-down: emptied').then(() => true).catch(() => false)) catsRemoved += 1;
    }

    const done = E.success('Slim-down complete',
      `🗑️ Deleted **${deleted}** never-used channels\n` +
      `🗄️ Archived **${archived}** channels with history (read-only, in **${ARCHIVE_CATEGORY}**)\n` +
      `📁 Removed **${catsRemoved}** empty categories\n\n` +
      'Every message ever posted is still readable. Run `/organize` to tidy the category order.\n\n' +
      '`/setup` will no longer recreate what you removed — `/config retired` reviews or undoes that.');

    if (failures.length) {
      done.addFields({ name: `⚠️ Skipped (${failures.length})`, value: clamp(failures.join('\n'), 1000) });
    }
    return interaction.editReply({ embeds: [done] });
  },
};

/** Timestamp of the most recent message, or null if the channel has never been used. */
async function lastMessageAt(channel) {
  const batch = await channel.messages.fetch({ limit: 1 }).catch(() => null);
  const last = batch?.first();
  return last ? last.createdTimestamp : null;
}

/** Accept "#general, media, 123456789" and resolve to a set of channel ids. */
function parseChannelList(guild, raw) {
  const out = new Set();
  if (!raw) return out;
  for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const mention = piece.match(/^<#(\d+)>$/);
    if (mention) { out.add(mention[1]); continue; }
    if (/^\d{5,}$/.test(piece)) { out.add(piece); continue; }
    const wanted = piece.replace(/^#/, '').toLowerCase();
    const found = guild.channels.cache.find((c) => c.name.toLowerCase().includes(wanted));
    if (found) out.add(found.id);
  }
  return out;
}

async function ensureArchive(guild, visibility) {
  let cat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === ARCHIVE_CATEGORY,
  );

  const staffIds = STAFF_KEYS.map((k) => db.roleId(k)).filter(Boolean);
  const memberRole = db.roleId('member');

  // 'members' keeps the history readable by everyone but silent. 'staff' hides
  // it outright, for when the sidebar matters more than the nostalgia.
  const overwrites = visibility === 'staff'
    ? [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      ...staffIds.map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory] })),
    ]
    : [
      {
        id: guild.roles.everyone.id,
        deny: [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.AddReactions],
      },
      ...(memberRole ? [{ id: memberRole, allow: [P.ViewChannel, P.ReadMessageHistory] }] : []),
      ...staffIds.map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory, P.ManageMessages] })),
    ];

  if (!cat) {
    cat = await guild.channels.create({
      name: ARCHIVE_CATEGORY,
      type: ChannelType.GuildCategory,
      permissionOverwrites: dedupeOverwrites(overwrites),
      reason: 'Slim-down archive',
    });
  } else {
    await cat.permissionOverwrites.set(dedupeOverwrites(overwrites), 'Slim-down archive').catch(() => {});
  }

  db.setId('categories', 'cat_archive', cat.id);
  // Park it at the bottom so it stops competing with the live channels.
  await cat.setPosition(guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size).catch(() => {});
  return cat;
}
