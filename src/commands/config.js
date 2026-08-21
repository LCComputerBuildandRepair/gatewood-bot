'use strict';
/**
 * /config — bind the bot to an EXISTING server and flip runtime settings.
 *
 * If you already have a Discord you don't want rebuilt, don't run /setup —
 * run `/config auto` to name-match your existing roles and channels onto the
 * blueprint keys, then fix any misses with `/config role` and `/config channel`.
 */
const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType,
} = require('discord.js');

const db = require('../database');
const E = require('../utils/embeds');
const {
  ROLES, PING_ROLES, INTEREST_ROLES, LEVEL_ROLES, CATEGORIES, STAT_CHANNELS,
} = require('../structure');

const EPH = MessageFlags.Ephemeral;

const ALL_ROLE_DEFS = [...ROLES, ...PING_ROLES, ...INTEREST_ROLES, ...LEVEL_ROLES];
const ALL_CHANNEL_DEFS = [
  ...CATEGORIES.flatMap((c) => c.channels.map((ch) => ({ ...ch, category: c.name }))),
  ...STAT_CHANNELS.map((s) => ({ key: s.key, name: s.template.replace('{n}', 'N'), category: 'stats' })),
];

const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Bind the bot to your server and change its settings.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('view').setDescription('Show every binding and setting.'))
    .addSubcommand((s) => s.setName('auto').setDescription('Name-match existing roles and channels onto the blueprint.'))
    .addSubcommand((s) => s.setName('role').setDescription('Bind one blueprint role key to a role.')
      .addStringOption((o) => o.setName('key').setDescription('Blueprint key').setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName('role').setDescription('The role').setRequired(true)))
    .addSubcommand((s) => s.setName('channel').setDescription('Bind one blueprint channel key to a channel.')
      .addStringOption((o) => o.setName('key').setDescription('Blueprint key').setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName('channel').setDescription('The channel').setRequired(true)))
    .addSubcommand((s) => s.setName('whitelist').setDescription('Switch between open and application-only city access.')
      .addStringOption((o) => o.setName('mode').setDescription('Which mode').setRequired(true).addChoices(
        { name: 'open — verifying grants access instantly', value: 'open' },
        { name: 'application — approved application required', value: 'application' },
      )))
    .addSubcommand((s) => s.setName('toggle').setDescription('Turn a feature on or off.')
      .addStringOption((o) => o.setName('feature').setDescription('Which feature').setRequired(true).addChoices(
        { name: 'automod', value: 'automod' },
        { name: 'leveling / XP', value: 'levelingEnabled' },
        { name: 'welcome messages', value: 'welcomeEnabled' },
      ))
      .addBooleanOption((o) => o.setName('on').setDescription('On or off').setRequired(true)))
    .addSubcommand((s) => s.setName('applications').setDescription('Open or close one application type.')
      .addStringOption((o) => o.setName('type').setDescription('Application type').setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName('open').setDescription('Open or closed').setRequired(true))),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();

    let pool = [];
    if (sub === 'role') pool = ALL_ROLE_DEFS.map((r) => ({ name: `${r.key} — ${r.name}`, value: r.key }));
    else if (sub === 'channel') pool = ALL_CHANNEL_DEFS.map((c) => ({ name: `${c.key} — ${c.name}`, value: c.key }));
    else if (sub === 'applications') {
      const { APPLICATIONS } = require('../applications');
      pool = APPLICATIONS.map((a) => ({ name: `${a.key} — ${a.label}`, value: a.key }));
    }

    const filtered = pool.filter((o) => o.value.toLowerCase().includes(focused) || o.name.toLowerCase().includes(focused));
    return interaction.respond(filtered.slice(0, 25));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') return view(interaction);
    if (sub === 'auto') return auto(interaction);
    if (sub === 'role') return bindRole(interaction);
    if (sub === 'channel') return bindChannel(interaction);
    if (sub === 'whitelist') return whitelist(interaction);
    if (sub === 'toggle') return toggle(interaction);
    if (sub === 'applications') return applications(interaction);
  },
};

// ── view ─────────────────────────────────────────────────────────────────────
async function view(interaction) {
  await interaction.deferReply({ flags: EPH });

  const roleIds = db.allIds('roles');
  const channelIds = db.allIds('channels');

  const boundRoles = ALL_ROLE_DEFS.filter((r) => roleIds[r.key]).length;
  const boundChannels = ALL_CHANNEL_DEFS.filter((c) => channelIds[c.key]).length;

  const missingRoles = ALL_ROLE_DEFS.filter((r) => !roleIds[r.key]).map((r) => r.key);
  const missingChannels = ALL_CHANNEL_DEFS.filter((c) => !channelIds[c.key]).map((c) => c.key);

  const core = ['owner', 'admin', 'mod', 'member', 'unverified', 'whitelist']
    .map((k) => `\`${k}\` → ${roleIds[k] ? `<@&${roleIds[k]}>` : '**unbound**'}`).join('\n');
  const logs = ['mod_logs', 'member_logs', 'ticket_logs', 'app_review', 'reports', 'status']
    .map((k) => `\`${k}\` → ${channelIds[k] ? `<#${channelIds[k]}>` : '**unbound**'}`).join('\n');

  const embed = E.base(E.COLORS.info)
    .setTitle('⚙️ Bot configuration')
    .addFields(
      { name: 'Whitelist mode', value: `**${db.get('whitelistMode', 'open')}**`, inline: true },
      { name: 'Automod', value: db.get('automod', true) ? 'on' : 'off', inline: true },
      { name: 'Leveling', value: db.get('levelingEnabled', true) ? 'on' : 'off', inline: true },
      { name: 'Welcome messages', value: db.get('welcomeEnabled', true) ? 'on' : 'off', inline: true },
      { name: 'Restart schedule', value: db.getRestarts().join(', ') || 'none set', inline: true },
      { name: 'Bindings', value: `Roles **${boundRoles}/${ALL_ROLE_DEFS.length}** · Channels **${boundChannels}/${ALL_CHANNEL_DEFS.length}**`, inline: true },
      { name: 'Key roles', value: core },
      { name: 'Key channels', value: logs },
    );

  if (missingRoles.length) embed.addFields({ name: `Unbound roles (${missingRoles.length})`, value: `\`${missingRoles.slice(0, 30).join('`, `')}\`` });
  if (missingChannels.length) embed.addFields({ name: `Unbound channels (${missingChannels.length})`, value: `\`${missingChannels.slice(0, 30).join('`, `')}\`` });

  return interaction.editReply({ embeds: [embed] });
}

// ── auto ─────────────────────────────────────────────────────────────────────
// Matches on the normalised name with emojis and punctuation stripped, so
// "🔧 Moderator", "Moderator" and "moderator" all resolve to the same key.
async function auto(interaction) {
  await interaction.deferReply({ flags: EPH });

  const guild = interaction.guild;
  await guild.roles.fetch();
  await guild.channels.fetch();

  const matchedRoles = [];
  for (const def of ALL_ROLE_DEFS) {
    if (db.roleId(def.key)) continue;
    const target = normalize(def.name.replace(/^\S+\s/, ''));
    const role = guild.roles.cache.find((r) => normalize(r.name) === target || normalize(r.name) === normalize(def.name));
    if (role) { db.setId('roles', def.key, role.id); matchedRoles.push(`\`${def.key}\` → ${role.name}`); }
  }

  const matchedChannels = [];
  for (const def of ALL_CHANNEL_DEFS) {
    if (db.channelId(def.key)) continue;
    const target = normalize(def.name.replace(/^.*・/, ''));
    const channel = guild.channels.cache.find(
      (c) => c.type !== ChannelType.GuildCategory && (normalize(c.name) === target || normalize(c.name) === normalize(def.name)),
    );
    if (channel) { db.setId('channels', def.key, channel.id); matchedChannels.push(`\`${def.key}\` → #${channel.name}`); }
  }

  const embed = E.success('Auto-bind complete',
    `Matched **${matchedRoles.length}** roles and **${matchedChannels.length}** channels by name.\n\n` +
    'Anything still unbound needs `/config role` or `/config channel`. Run `/config view` to see what is left.');
  if (matchedRoles.length) embed.addFields({ name: 'Roles', value: matchedRoles.slice(0, 20).join('\n').slice(0, 1000) });
  if (matchedChannels.length) embed.addFields({ name: 'Channels', value: matchedChannels.slice(0, 20).join('\n').slice(0, 1000) });

  return interaction.editReply({ embeds: [embed] });
}

// ── bindings ─────────────────────────────────────────────────────────────────
async function bindRole(interaction) {
  const key = interaction.options.getString('key');
  const role = interaction.options.getRole('role');
  if (!ALL_ROLE_DEFS.some((r) => r.key === key)) {
    return interaction.reply({ embeds: [E.error('Unknown key', `\`${key}\` is not a blueprint role key.`)], flags: EPH });
  }
  db.setId('roles', key, role.id);
  return interaction.reply({ embeds: [E.success('Bound', `\`${key}\` → ${role}`)], flags: EPH });
}

async function bindChannel(interaction) {
  const key = interaction.options.getString('key');
  const channel = interaction.options.getChannel('channel');
  db.setId('channels', key, channel.id);
  return interaction.reply({ embeds: [E.success('Bound', `\`${key}\` → <#${channel.id}>`)], flags: EPH });
}

// ── settings ─────────────────────────────────────────────────────────────────
async function whitelist(interaction) {
  const mode = interaction.options.getString('mode');
  db.set('whitelistMode', mode);

  const note = mode === 'open'
    ? 'Verifying now grants city access instantly. Re-post the verify and applications panels with `/panel verify replace:true` and `/panel applications replace:true` so they say the right thing.'
    : 'City access now requires an approved whitelist application. Re-post the panels with `/panel verify replace:true` and `/panel applications replace:true`.';

  return interaction.reply({ embeds: [E.success(`Whitelist mode: ${mode}`, note)], flags: EPH });
}

async function toggle(interaction) {
  const feature = interaction.options.getString('feature');
  const on = interaction.options.getBoolean('on');
  db.set(feature, on);
  return interaction.reply({ embeds: [E.success('Setting updated', `**${feature}** is now **${on ? 'on' : 'off'}**.`)], flags: EPH });
}

async function applications(interaction) {
  const type = interaction.options.getString('type');
  const open = interaction.options.getBoolean('open');
  db.setAppOpen(type, open);
  return interaction.reply({
    embeds: [E.success('Applications updated', `**${type}** applications are now **${open ? 'open' : 'closed'}**.\n\nRe-post the panel with \`/panel applications replace:true\` so the channel reflects it.`)],
    flags: EPH,
  });
}
