'use strict';
/**
 * /audit — read-only survey of every channel: has anyone ever posted, when
 * last, and by how many different people.
 *
 * Nothing is changed. This exists so the decision about what to cut is made
 * from evidence rather than from a guess about what people "probably" use.
 * Feed its output into /slim.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
  AttachmentBuilder,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const { ts, clamp } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

// Channels the bot itself writes to. They can look dead while doing their job
// (nobody has been banned yet, so #mod-logs is empty), so they are reported
// separately and never suggested for removal.
const BOT_MANAGED = new Set([
  'welcome', 'rules', 'verify', 'announce', 'updates', 'status', 'roles',
  'support', 'applications', 'faq', 'connect',
  'highlights', 'golive', 'giveaways', 'suggest',
  'app_review', 'reports', 'ticket_logs', 'mod_logs', 'member_logs',
  'message_logs', 'voice_logs', 'server_logs', 'ingame_feed', 'ingame_chat',
  'stat_members', 'stat_players', 'stat_status', 'vc_create',
]);

const DAY = 864e5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Survey every channel: what gets used, what has never been touched. Changes nothing.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) => o.setName('quiet_days')
      .setDescription('Days with no messages before a channel counts as quiet (default 30)'))
    .addBooleanOption((o) => o.setName('deep')
      .setDescription('Count messages and unique posters. Much slower, far more useful.')),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const quietDays = Math.max(1, interaction.options.getInteger('quiet_days') || 30);
    const deep = interaction.options.getBoolean('deep') ?? false;

    const guild = interaction.guild;
    await guild.channels.fetch();

    // Reverse the id registry so a channel can name its own blueprint key.
    const keyById = new Map();
    for (const [key, id] of Object.entries(db.allIds('channels'))) keyById.set(id, key);

    const textish = [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
      .sort((a, b) => (a.parent?.name || '').localeCompare(b.parent?.name || '') || a.position - b.position);

    const rows = [];
    let scanned = 0;

    for (const ch of textish) {
      const stat = await scanChannel(ch, deep);
      rows.push({
        channel: ch,
        key: keyById.get(ch.id) || null,
        botManaged: BOT_MANAGED.has(keyById.get(ch.id)),
        isTicket: !!db.getTicket(ch.id),
        ...stat,
      });

      scanned += 1;
      if (scanned % 25 === 0) {
        await interaction.editReply({
          embeds: [E.info('🔎 Auditing…', `Scanned **${scanned}/${textish.length}** channels.`)],
        }).catch(() => {});
      }
    }

    // ── Classify ──
    const now = Date.now();
    const dead = rows.filter((r) => !r.lastAt && !r.isTicket);
    const quiet = rows.filter((r) => r.lastAt && now - r.lastAt > quietDays * DAY && !r.isTicket);
    const active = rows.filter((r) => r.lastAt && now - r.lastAt <= quietDays * DAY);

    // Safe to remove = never used AND not something the bot depends on.
    const removable = dead.filter((r) => !r.botManaged);
    const deadButNeeded = dead.filter((r) => r.botManaged);

    const voiceCount = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;

    const embed = E.base(E.COLORS.info)
      .setTitle('🔎 Channel audit')
      .setDescription(
        `**${textish.length}** text channels · **${voiceCount}** voice · **${categories}** categories\n` +
        `Quiet threshold: no messages in **${quietDays} days**.` +
        (deep ? '' : '\n\n*Cheap scan — add `deep:true` for message counts and unique posters.*'),
      )
      .addFields(
        { name: '🟢 Active', value: `**${active.length}** channels used in the last ${quietDays} days`, inline: true },
        { name: '🟡 Quiet', value: `**${quiet.length}** have history but nothing recent`, inline: true },
        { name: '⚫ Never used', value: `**${dead.length}** have no messages at all`, inline: true },
        {
          name: '✂️ Safe to remove now',
          value: removable.length
            ? `**${removable.length}** channels: never posted in, and nothing in the bot depends on them.\n` +
              clamp(removable.map((r) => `#${r.channel.name}`).join(', '), 900)
            : 'None — every empty channel is one the bot writes to.',
        },
      );

    if (deadButNeeded.length) {
      embed.addFields({
        name: `⚙️ Empty but bot-managed (${deadButNeeded.length})`,
        value: clamp(`${deadButNeeded.map((r) => `#${r.channel.name}`).join(', ')}\n` +
          '*These are logs and panels. Empty just means nothing has happened yet — deleting them breaks features.*', 1000),
      });
    }

    // Busiest and deadest, which is usually the whole story.
    if (deep) {
      const busiest = [...rows].sort((a, b) => b.messages - a.messages).slice(0, 8);
      embed.addFields({
        name: '🔥 Busiest channels',
        value: clamp(busiest.map((r) => `**#${r.channel.name}** — ${r.messages}${r.capped ? '+' : ''} msgs · ${r.authors} posters`).join('\n'), 1000),
      });
    }

    const file = new AttachmentBuilder(
      Buffer.from(buildReport(rows, { quietDays, deep, guildName: guild.name }), 'utf8'),
      { name: `gatewood-channel-audit-${new Date().toISOString().slice(0, 10)}.md` },
    );

    embed.setFooter({
      text: 'Full per-channel breakdown attached • run /slim to act on it',
      iconURL: E.getBrandIcon() || undefined,
    });

    return interaction.editReply({ embeds: [embed], files: [file] });
  },
};

/**
 * Cheap mode costs one API call per channel and answers "has anyone ever
 * posted, and when". Deep mode pages the history for counts and unique
 * posters, which is what tells you a channel is technically alive but really
 * just two people saying "dead chat".
 */
async function scanChannel(channel, deep) {
  const empty = { messages: 0, lastAt: null, authors: 0, capped: false };
  try {
    if (!deep) {
      const batch = await channel.messages.fetch({ limit: 1 }).catch(() => null);
      const last = batch?.first();
      return last
        ? { messages: 1, lastAt: last.createdTimestamp, authors: 1, capped: true }
        : empty;
    }

    const LIMIT = 500;
    const authors = new Set();
    let count = 0;
    let lastAt = null;
    let before;

    while (count < LIMIT) {
      const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!batch?.size) break;
      if (lastAt === null) lastAt = batch.first().createdTimestamp;
      for (const m of batch.values()) {
        if (!m.author.bot) authors.add(m.author.id);
        count += 1;
      }
      before = batch.last().id;
      if (batch.size < 100) break;
    }
    return { messages: count, lastAt, authors: authors.size, capped: count >= LIMIT };
  } catch {
    return empty;
  }
}

function buildReport(rows, { quietDays, deep, guildName }) {
  const now = Date.now();
  const state = (r) => {
    if (!r.lastAt) return 'NEVER USED';
    return now - r.lastAt > quietDays * DAY ? 'quiet' : 'active';
  };
  const when = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '—');

  const byCategory = new Map();
  for (const r of rows) {
    const cat = r.channel.parent?.name || '(no category)';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(r);
  }

  const out = [
    `# ${guildName} — channel audit`,
    '',
    `Generated ${new Date().toISOString()}`,
    `Quiet threshold: ${quietDays} days. Scan mode: ${deep ? 'deep (counts up to 500/channel)' : 'cheap (last message only)'}.`,
    '',
    'Nothing was changed by this report.',
    '',
  ];

  for (const [cat, list] of byCategory) {
    const usedCount = list.filter((r) => r.lastAt).length;
    out.push(`## ${cat}`, '', `${list.length} channels, ${usedCount} ever used.`, '');
    out.push(deep
      ? '| channel | state | msgs | posters | last post | notes |'
      : '| channel | state | last post | notes |');
    out.push(deep ? '|---|---|---|---|---|---|' : '|---|---|---|---|');

    for (const r of list) {
      const notes = [
        r.botManaged ? 'bot-managed' : null,
        r.isTicket ? 'open ticket' : null,
        r.key ? `key:${r.key}` : 'not in blueprint',
      ].filter(Boolean).join(', ');

      out.push(deep
        ? `| #${r.channel.name} | ${state(r)} | ${r.messages}${r.capped ? '+' : ''} | ${r.authors} | ${when(r.lastAt)} | ${notes} |`
        : `| #${r.channel.name} | ${state(r)} | ${when(r.lastAt)} | ${notes} |`);
    }
    out.push('');
  }

  const removable = rows.filter((r) => !r.lastAt && !r.botManaged && !r.isTicket);
  out.push('## Never used, nothing depends on them', '');
  out.push(removable.length
    ? removable.map((r) => `- #${r.channel.name}  (${r.channel.parent?.name || 'no category'})`).join('\n')
    : '_None._');
  out.push('', '---', '', 'Act on this with `/slim preview:true`, which deletes only empty channels and moves anything with history into an archive category.');

  return out.join('\n');
}
