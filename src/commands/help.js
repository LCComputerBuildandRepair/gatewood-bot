'use strict';
/**
 * /help — what the bot can do, filtered to what the person asking can use.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const E = require('../utils/embeds');
const { isStaff, isSenior, channelMention } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

const MEMBER = [
  ['/status', 'Live player count and server health'],
  ['/players list', 'Who is in the city right now'],
  ['/link me', 'Tie your Discord to your character (needed for queue priority)'],
  ['/rank', 'Your Discord activity level'],
  ['/leaderboard', 'The most active members'],
  ['/userinfo', 'What the bot knows about a member'],
  ['/serverinfo', 'Discord and city stats side by side'],
  ['/priority check', 'Whether you have queue priority'],
  ['/staff online', 'Which staff are on duty'],
];

const STAFF = [
  ['/mod …', 'warn · warnings · timeout · kick · ban · purge · lock · notes'],
  ['/ticket …', 'add · remove · close · rename · open on someone’s behalf'],
  ['/application …', 'pending · view · decide · history'],
  ['/department …', 'hire · rank · fire · roster'],
  ['/org …', 'create · add · remove · list · disband'],
  ['/priority …', 'grant · custom · revoke · list'],
  ['/players lookup', 'Identifiers for a connected player'],
  ['/staff duty', 'Clock on and off shift'],
  ['/announce', 'Branded announcements with the right ping'],
  ['/giveaway …', 'start · end · reroll'],
  ['/poll', 'Reaction poll, up to 10 options'],
  ['/say · /embed', 'Post as the bot'],
];

const ADMIN = [
  ['/setup', 'Build or repair the whole server'],
  ['/build-departments', 'Department roles, categories and channels'],
  ['/build-tickets', 'Pre-create the ticket categories'],
  ['/organize', 'Sort the categories into order'],
  ['/config …', 'view · auto · role · channel · whitelist · toggle · applications'],
  ['/panel …', 'Re-post any interactive panel'],
  ['/restart …', 'schedule · list · clear · now'],
  ['/streamers …', 'Twitch go-live watch list'],
  ['/cleanup', 'Remove leftovers from an old server layout'],
  ['/reset', 'Delete everything the bot created'],
];

const table = (rows) => rows.map(([cmd, desc]) => `\`${cmd}\`\n> ${desc}`).join('\n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('What this bot can do.'),

  async execute(interaction) {
    const staff = isStaff(interaction.member);
    const senior = isSenior(interaction.member) || interaction.member.permissions.has('Administrator');

    const embed = E.base(E.COLORS.brand)
      .setTitle(`${config.communityName} — bot commands`)
      .setDescription(
        'Everything below is a slash command — type `/` in any channel.\n\n' +
        `New here? Read the rules in ${channelMention('rules') || '#rules'}, verify in ${channelMention('verify') || '#verify'}, then pick your roles in ${channelMention('roles') || '#get-roles'}.`,
      )
      .addFields({ name: '👤 Everyone', value: table(MEMBER) });

    if (staff) embed.addFields({ name: '🛡️ Staff', value: table(STAFF) });
    if (senior) embed.addFields({ name: '⚙️ Administrators', value: table(ADMIN) });

    if (!staff) {
      embed.addFields({
        name: 'Need a person?',
        value: `Open a ticket in ${channelMention('support') || 'the support channel'} — that is always faster than asking in general chat.`,
      });
    }

    return interaction.reply({ embeds: [embed], flags: EPH });
  },
};
