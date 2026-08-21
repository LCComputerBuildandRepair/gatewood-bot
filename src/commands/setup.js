'use strict';
/**
 * /setup — reconcile the live Discord against src/structure.js.
 *
 * Idempotent by design: everything is found-or-created by name, ids are merged
 * into db.json rather than overwritten, and nothing is ever deleted. Run it as
 * often as you like — it repairs a broken server as readily as it builds a new
 * one.
 */
const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const panels = require('../panels');
const {
  ROLES, PING_ROLES, INTEREST_ROLES, LEVEL_ROLES,
  CATEGORIES, STAT_CHANNELS, STAT_CATEGORY, STAFF_KEYS,
} = require('../structure');
const { dedupeOverwrites } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;
const P = PermissionFlagsBits;

const TYPE_MAP = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};

// Announcement, forum and media channels only exist in Community-enabled
// servers. Asking for one anywhere else makes Discord reject the entire create
// call with BASE_TYPE_CHOICES, so fall back to a plain text channel and let
// setup finish. Enable Community later and re-run to get the real thing.
function resolveType(guild, wanted) {
  const type = TYPE_MAP[wanted] || ChannelType.GuildText;
  const communityOnly = [ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia];
  if (communityOnly.includes(type) && !guild.features.includes('COMMUNITY')) return ChannelType.GuildText;
  return type;
}

// Which blueprint role keys can see each visibility tier (staff always can).
const AUDIENCE = {
  verified: ['member', 'whitelist'],
  whitelist: ['whitelist'],
  staff: [],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Build or repair the entire Gatewood Discord — roles, channels, permissions and panels.')
    .addStringOption((o) => o.setName('mode').setDescription('What to build').addChoices(
      { name: 'all — roles, channels, stats & panels', value: 'all' },
      { name: 'roles only', value: 'roles' },
      { name: 'channels only', value: 'channels' },
      { name: 'stat counters only', value: 'stats' },
      { name: 'panels only (re-post messages)', value: 'panels' },
    ))
    .setDefaultMemberPermissions(P.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(P.Administrator)) {
      return interaction.reply({ embeds: [E.error('Admins only', 'You need Administrator to run setup.')], flags: EPH });
    }

    await interaction.reply({
      embeds: [E.info('⚙️ Building Gatewood…', 'Reconciling roles, channels, permissions and panels.\n\nA first run creates ~40 roles and ~70 channels, so Discord rate limits will make this take a minute or two. Sit tight.')],
      flags: EPH,
    });

    const guild = interaction.guild;
    const mode = interaction.options.getString('mode') || 'all';
    const log = [];

    try {
      if (mode === 'all' || mode === 'roles') await buildRoles(guild, log);
      if (mode === 'all' || mode === 'channels') await buildChannels(guild, log);
      if (mode === 'all' || mode === 'stats') await buildStatCounters(guild, log);
      if (mode === 'all' || mode === 'panels' || mode === 'channels') await postPanels(guild, log);
      if (mode === 'all') await applyServerIcon(guild, log);

      const shown = log.slice(0, 35).join('\n') || 'Nothing to do — everything was already in place.';
      const more = log.length > 35 ? `\n\n…and ${log.length - 35} more.` : '';

      await interaction.editReply({
        embeds: [E.success('Setup complete', shown + more)
          .setFooter({ text: `${log.length} actions • re-run /setup any time to repair`, iconURL: E.getBrandIcon() || undefined })],
      });
    } catch (err) {
      console.error('[setup] failed:', err);
      // Name the actual cause where Discord's error is specific enough to tell.
      let hint = 'Most likely cause: my role is not at the **top** of the role list, or I am missing **Manage Roles** / **Manage Channels**.';
      if (/BASE_TYPE_CHOICES/.test(err.message)) {
        hint = 'This server is not **Community-enabled**, so Discord will not allow announcement or forum channels. Update the bot and re-run — it falls back to normal text channels.';
      } else if (err.code === 50013 || /Missing Permissions/i.test(err.message)) {
        hint = 'I am missing permissions. Drag my role to the **top** of the role list and make sure I have **Manage Roles** and **Manage Channels**.';
      } else if (err.code === 30013 || /Maximum number of/i.test(err.message)) {
        hint = 'This server has hit a Discord limit (500 channels or 250 roles). Run `/cleanup preview` to see what can go.';
      }
      await interaction.editReply({
        embeds: [E.error('Setup failed', `\`${err.message}\`\n\n${hint}`)],
      });
    }
  },
};

// ── Roles ────────────────────────────────────────────────────────────────────
async function buildRoles(guild, log) {
  const all = [...ROLES, ...PING_ROLES, ...INTEREST_ROLES, ...LEVEL_ROLES];
  await guild.roles.fetch();

  for (const def of all) {
    let role = guild.roles.cache.find((r) => r.name === def.name);
    const perms = def.admin
      ? [P.Administrator]
      : (def.perms || []).map((p) => P[p]).filter(Boolean);

    if (!role) {
      role = await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: !!def.hoist,
        mentionable: !!def.mentionable,
        permissions: perms,
        reason: 'Gatewood setup',
      });
      log.push(`➕ Role **${def.name}**`);
    }
    db.setId('roles', def.key, role.id);
  }

  await orderRoles(guild, all, log);
}

/**
 * Put the roles in blueprint order, directly beneath the bot's own role.
 * Best-effort: Discord rejects any move above the bot, so failures are ignored
 * rather than aborting setup.
 */
async function orderRoles(guild, defs, log) {
  const botPosition = guild.members.me?.roles.highest.position ?? 0;
  if (botPosition < 2) {
    log.push('⚠️ My role is too low to order roles — drag it to the top and re-run.');
    return;
  }

  const positions = [];
  let slot = botPosition - 1;
  for (const def of defs) {
    const id = db.roleId(def.key);
    if (!id || slot < 1) continue;
    positions.push({ role: id, position: slot });
    slot -= 1;
  }
  try {
    await guild.roles.setPositions(positions);
    log.push('🔢 Ordered roles under my own role.');
  } catch { /* positions are cosmetic */ }
}

// ── Channels ─────────────────────────────────────────────────────────────────
function overwritesFor(guild, visibility, readonly) {
  const everyone = guild.roles.everyone.id;
  const ow = [];
  const SEND = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.Speak];

  if (!visibility || visibility === 'public') {
    if (readonly) ow.push({ id: everyone, deny: SEND });
  } else {
    ow.push({ id: everyone, deny: [P.ViewChannel] });
    for (const key of AUDIENCE[visibility] || []) {
      const id = db.roleId(key);
      if (!id) continue;
      ow.push({
        id,
        allow: [P.ViewChannel, P.ReadMessageHistory, P.Connect, P.Speak, P.AttachFiles, P.EmbedLinks],
        deny: readonly ? SEND : [],
      });
    }
  }

  // Staff see and post everywhere, readonly or not.
  for (const key of STAFF_KEYS) {
    const id = db.roleId(key);
    if (!id) continue;
    ow.push({
      id,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak, P.ManageMessages, P.AttachFiles, P.EmbedLinks],
    });
  }

  // The Muted role can read but never speak, anywhere.
  const muted = db.roleId('muted');
  if (muted) ow.push({ id: muted, deny: [...SEND, P.AddReactions] });

  return dedupeOverwrites(ow);
}

async function buildChannels(guild, log) {
  await guild.channels.fetch();

  for (const cat of CATEGORIES) {
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === cat.name,
    );
    if (!category) {
      category = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwritesFor(guild, cat.visibility, false),
        reason: 'Gatewood setup',
      });
      log.push(`📁 Category **${cat.name}**`);
    }
    db.setId('categories', cat.key, category.id);

    for (const ch of cat.channels) {
      const visibility = ch.visibility || cat.visibility;
      let channel = guild.channels.cache.find((c) => c.parentId === category.id && c.name === ch.name);

      // Adopt an existing channel by alias so its history survives.
      if (!channel && ch.aliases) {
        const adopted = findAdoptable(guild, ch);
        if (adopted) {
          channel = adopted;
          if (channel.parentId !== category.id) {
            await channel.setParent(category.id, { lockPermissions: true }).catch(() => {});
          }
          if (channel.name !== ch.name) await channel.setName(ch.name).catch(() => {});
          log.push(`♻️ Adopted **#${adopted.name}** → ${ch.name}`);
        }
      }

      if (!channel) {
        channel = await guild.channels.create({
          name: ch.name,
          type: resolveType(guild, ch.type),
          parent: category.id,
          topic: ch.type === 'voice' ? undefined : ch.topic,
          permissionOverwrites: overwritesFor(guild, visibility, ch.readonly),
          reason: 'Gatewood setup',
        });
        log.push(`#️⃣ ${ch.name}`);
      }
      db.setId('channels', ch.key, channel.id);
    }
  }
}

const normalize = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function findAdoptable(guild, def) {
  const wanted = new Set([def.name, ...(def.aliases || [])].map(normalize));
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && wanted.has(normalize(c.name)),
  ) || null;
}

// ── Live stat counters ───────────────────────────────────────────────────────
// Locked voice channels whose names are rewritten on a timer (see src/tasks.js).
async function buildStatCounters(guild, log) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === STAT_CATEGORY.name,
  );
  if (!category) {
    category = await guild.channels.create({
      name: STAT_CATEGORY.name,
      type: ChannelType.GuildCategory,
      reason: 'Gatewood stat counters',
    });
    log.push(`📁 Category **${STAT_CATEGORY.name}**`);
  }
  db.setId('categories', STAT_CATEGORY.key, category.id);

  for (const def of STAT_CHANNELS) {
    const stored = db.channelId(def.key);
    if (stored && guild.channels.cache.has(stored)) continue;

    const placeholder = def.template.replace('{n}', '…');
    let channel = guild.channels.cache.find((c) => c.parentId === category.id && c.name.startsWith(def.template.split('{n}')[0]));
    if (!channel) {
      channel = await guild.channels.create({
        name: placeholder,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [P.Connect] }],
        reason: 'Gatewood stat counter',
      });
      log.push(`📈 Counter **${placeholder}**`);
    }
    db.setId('channels', def.key, channel.id);
  }
}

// ── Panels ───────────────────────────────────────────────────────────────────
// Only posts when the channel has no bot embed already, so repeat runs of
// /setup don't stack duplicate panels. Use /panel to force a re-post.
async function postPanelOnce(guild, channelKey, build, tag, log) {
  const id = db.channelId(channelKey);
  if (!id) return;
  const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  if (!ch?.isTextBased()) return;

  const recent = await ch.messages.fetch({ limit: 25 }).catch(() => null);
  const mine = recent?.find((m) => m.author.id === guild.members.me.id && m.embeds.length);
  if (mine) return;

  await ch.send(build());
  log.push(`📨 Panel → #${ch.name} (${tag})`);
}

async function postPanels(guild, log) {
  await postPanelOnce(guild, 'welcome', panels.welcomePanel, 'welcome', log);
  await postPanelOnce(guild, 'rules', panels.rulesPanel, 'rulebook', log);
  await postPanelOnce(guild, 'verify', panels.verifyPanel, 'verify', log);
  await postPanelOnce(guild, 'roles', panels.rolesPanel, 'self-roles', log);
  await postPanelOnce(guild, 'support', panels.ticketPanel, 'tickets', log);
  await postPanelOnce(guild, 'applications', panels.applicationsPanel, 'applications', log);
  await postPanelOnce(guild, 'faq', panels.faqPanel, 'faq', log);
  await postPanelOnce(guild, 'connect', panels.connectPanel, 'connect guide', log);
}

// ── Branding ─────────────────────────────────────────────────────────────────
async function applyServerIcon(guild, log) {
  try {
    const logo = ['logo.png', 'logo.jpg', 'logo.jpeg']
      .map((f) => path.join(__dirname, '..', '..', 'assets', f))
      .find((p) => fs.existsSync(p));
    if (!logo) return;
    if (!guild.members.me.permissions.has(P.ManageGuild)) return;
    await guild.setIcon(logo, 'Gatewood branding');
    log.push('🖼️ Set the server icon from assets/logo');
  } catch { /* branding is best-effort */ }
}

module.exports.overwritesFor = overwritesFor;
