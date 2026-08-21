'use strict';
/**
 * /link — tie a Discord account to an in-game identifier.
 *
 * The bridge uses this mapping to answer whitelist and priority-queue checks
 * from FXServer, and staff use it to go from a Discord report straight to the
 * right in-game account.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const fivem = require('../fivem');
const { isStaff, ts, clamp } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Connect your Discord to your in-game character.')
    .addSubcommand((s) => s.setName('me').setDescription('Link yourself using your in-game name (you must be connected).')
      .addStringOption((o) => o.setName('ingame_name').setDescription('Your exact in-game name right now').setRequired(true)))
    .addSubcommand((s) => s.setName('manual').setDescription('Staff: link a member to a license by hand.')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('license').setDescription('license:xxxxx identifier').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('In-game name')))
    .addSubcommand((s) => s.setName('view').setDescription('See a link.')
      .addUserOption((o) => o.setName('member').setDescription('Whose (default: yours)')))
    .addSubcommand((s) => s.setName('unlink').setDescription('Remove a link.')
      .addUserOption((o) => o.setName('member').setDescription('Whose (staff only for other people)'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'me') return linkSelf(interaction);
    if (sub === 'manual') return linkManual(interaction);
    if (sub === 'view') return view(interaction);
    if (sub === 'unlink') return unlink(interaction);
  },
};

/**
 * Self-service link: we read the live player list and match the name the member
 * typed. That proves they are actually connected as that character, which is
 * enough for queue priority without asking anyone to paste identifiers.
 */
async function linkSelf(interaction) {
  await interaction.deferReply({ flags: EPH });

  const wanted = interaction.options.getString('ingame_name').trim().toLowerCase();
  const status = await fivem.query();

  if (!status.online) {
    return interaction.editReply({ embeds: [E.error('Server offline', 'I cannot read the player list right now. Try again once the city is back up, or ask staff to link you manually.')] });
  }

  const player = status.list.find((p) => fivem.stripColors(p.name).toLowerCase() === wanted);
  if (!player) {
    return interaction.editReply({
      embeds: [E.error('Not found in the city',
        `I could not see a connected player called **${clamp(interaction.options.getString('ingame_name'), 100)}**.\n\n` +
        'Connect to the server first, then run this again with your name spelled exactly as it appears in game.')],
    });
  }

  const license = (player.identifiers || []).find((i) => i.startsWith('license:')) || null;
  if (!license) {
    return interaction.editReply({ embeds: [E.error('No license identifier', 'That player has no `license:` identifier, which usually means FiveM is running without CFX auth. Ask staff to link you manually.')] });
  }

  const taken = db.userByLicense(license);
  if (taken && taken !== interaction.user.id) {
    return interaction.editReply({ embeds: [E.error('Already linked', 'That in-game account is linked to a different Discord user. Open a support ticket if that is wrong.')] });
  }

  db.setLink(interaction.user.id, {
    license,
    steam: (player.identifiers || []).find((i) => i.startsWith('steam:')) || null,
    name: fivem.stripColors(player.name),
    at: Date.now(),
  });

  return interaction.editReply({
    embeds: [E.success('Linked', `**${fivem.stripColors(player.name)}** is now tied to your Discord account.\n\nQueue priority and whitelist checks will use this from now on.`)],
  });
}

async function linkManual(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Staff only', 'Only staff can link someone else by hand.')], flags: EPH });
  }
  const user = interaction.options.getUser('member');
  const license = interaction.options.getString('license').trim();
  const name = interaction.options.getString('name') || null;

  db.setLink(user.id, { license, steam: null, name, at: Date.now(), by: interaction.user.id });
  return interaction.reply({
    embeds: [E.success('Linked', `<@${user.id}> → \`${license}\`${name ? ` (${name})` : ''}`)],
    flags: EPH,
  });
}

async function view(interaction) {
  const user = interaction.options.getUser('member') || interaction.user;
  if (user.id !== interaction.user.id && !isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Staff only', 'You can only view your own link.')], flags: EPH });
  }

  const link = db.getLink(user.id);
  if (!link) {
    return interaction.reply({ embeds: [E.info('Not linked', `<@${user.id}> has no in-game account linked. Run \`/link me\` while connected.`)], flags: EPH });
  }

  const priority = db.getPriority(user.id);
  const embed = E.base(E.COLORS.info)
    .setTitle('🔗 Account link')
    .addFields(
      { name: 'Discord', value: `<@${user.id}>`, inline: true },
      { name: 'In-game name', value: link.name || '—', inline: true },
      { name: 'Linked', value: ts(link.at), inline: true },
      { name: 'License', value: `\`${link.license}\`` },
      { name: 'Queue priority', value: priority ? `${priority.slots} (${priority.tier || 'custom'})` : 'none', inline: true },
    );
  return interaction.reply({ embeds: [embed], flags: EPH });
}

async function unlink(interaction) {
  const user = interaction.options.getUser('member') || interaction.user;
  if (user.id !== interaction.user.id && !isStaff(interaction.member)) {
    return interaction.reply({ embeds: [E.error('Staff only', 'You can only unlink yourself.')], flags: EPH });
  }
  db.removeLink(user.id);
  return interaction.reply({ embeds: [E.success('Unlinked', `<@${user.id}> is no longer tied to an in-game account.`)], flags: EPH });
}
