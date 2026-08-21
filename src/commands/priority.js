'use strict';
/**
 * /priority — queue priority for donators, creators and staff.
 *
 * The bot stores the slots; the FiveM resource asks for them at connect time
 * and hands the number to whatever queue script you run. Higher = further up.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const { isStaff, parseDuration, ts, clamp } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

const TIERS = [
  { name: '🥉 Bronze — 10 slots', value: 'bronze', slots: 10, role: 'donator_bronze' },
  { name: '🥈 Silver — 25 slots', value: 'silver', slots: 25, role: 'donator_silver' },
  { name: '🥇 Gold — 50 slots', value: 'gold', slots: 50, role: 'donator_gold' },
  { name: '🎬 Creator — 40 slots', value: 'creator', slots: 40, role: 'creator' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('priority')
    .setDescription('Manage queue priority.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('grant').setDescription('Give a member queue priority.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('tier').setDescription('Which tier').setRequired(true).addChoices(...TIERS.map(({ name, value }) => ({ name, value }))))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 30d — leave blank for permanent')))
    .addSubcommand((s) => s.setName('custom').setDescription('Set an exact slot count.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addIntegerOption((o) => o.setName('slots').setDescription('Priority value').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 30d — leave blank for permanent')))
    .addSubcommand((s) => s.setName('revoke').setDescription('Remove a member’s priority.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Everyone who currently has priority.'))
    .addSubcommand((s) => s.setName('check').setDescription('Check one member.')
      .addUserOption((o) => o.setName('member').setDescription('Who (default: you)'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'check') return check(interaction);

    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [E.error('Staff only', 'Only staff manage queue priority.')], flags: EPH });
    }
    if (sub === 'grant') return grant(interaction, false);
    if (sub === 'custom') return grant(interaction, true);
    if (sub === 'revoke') return revoke(interaction);
    if (sub === 'list') return list(interaction);
  },
};

async function grant(interaction, custom) {
  await interaction.deferReply({ flags: EPH });

  const user = interaction.options.getUser('member');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const durationText = interaction.options.getString('duration');

  let until = null;
  if (durationText) {
    const ms = parseDuration(durationText);
    if (!ms) return interaction.editReply({ embeds: [E.error('Bad duration', 'Use `30d`, `2w`, `12h` — a number and a unit.')] });
    until = Date.now() + ms;
  }

  let slots;
  let tier;
  if (custom) {
    slots = interaction.options.getInteger('slots');
    tier = 'custom';
  } else {
    const chosen = TIERS.find((t) => t.value === interaction.options.getString('tier'));
    slots = chosen.slots;
    tier = chosen.value;
    // The matching cosmetic role comes along with the priority.
    const roleId = db.roleId(chosen.role);
    if (roleId && member) await member.roles.add(roleId, `Priority tier: ${tier}`).catch(() => {});
  }

  db.setPriority(user.id, { slots, tier, until, grantedBy: interaction.user.id, at: Date.now() });

  await member?.send({
    embeds: [E.success('Queue priority granted',
      `You now have **${slots}** priority slots in **${interaction.guild.name}**` +
      (until ? `, until ${ts(until)}.` : ' — permanently.') +
      '\n\nMake sure you have run `/link me` while connected, or the server cannot match you to this.')],
  }).catch(() => {});

  return interaction.editReply({
    embeds: [E.success('Priority granted', `<@${user.id}> → **${slots}** slots (${tier})${until ? `, expires ${ts(until)}` : ', permanent'}.`)],
  });
}

async function revoke(interaction) {
  const user = interaction.options.getUser('member');
  db.removePriority(user.id);
  return interaction.reply({ embeds: [E.success('Priority revoked', `<@${user.id}> is back in the normal queue.`)], flags: EPH });
}

async function list(interaction) {
  await interaction.deferReply({ flags: EPH });

  const all = Object.entries(db.allPriority())
    .map(([id, p]) => ({ id, ...p }))
    .filter((p) => !p.until || p.until > Date.now())
    .sort((a, b) => b.slots - a.slots);

  if (!all.length) return interaction.editReply({ embeds: [E.info('Nobody has priority', 'Grant some with `/priority grant`.')] });

  const lines = all.slice(0, 40).map((p) =>
    `**${p.slots}** — <@${p.id}> · ${p.tier}${p.until ? ` · until ${ts(p.until)}` : ''}`);

  return interaction.editReply({
    embeds: [E.base(E.COLORS.brand)
      .setTitle('⏫ Queue priority')
      .setDescription(clamp(lines.join('\n'), 3800))
      .setFooter({ text: `${all.length} members`, iconURL: E.getBrandIcon() || undefined })],
  });
}

async function check(interaction) {
  const user = interaction.options.getUser('member') || interaction.user;
  if (user.id !== interaction.user.id && !isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Staff only', 'You can only check your own.')], flags: EPH });
  }
  const p = db.getPriority(user.id);
  const active = p && (!p.until || p.until > Date.now());

  return interaction.reply({
    embeds: [active
      ? E.success('Priority active', `<@${user.id}> — **${p.slots}** slots (${p.tier})${p.until ? `, expires ${ts(p.until)}` : ', permanent'}.`)
      : E.info('No priority', `<@${user.id}> is in the normal queue.`)],
    flags: EPH,
  });
}
