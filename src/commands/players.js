'use strict';
/**
 * /players — who is in the city right now, and staff lookup of a connected
 * player's identifiers.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const fivem = require('../fivem');
const { isStaff, clamp } = require('../utils/helpers');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('players')
    .setDescription('Who is connected to the city.')
    .addSubcommand((s) => s.setName('list').setDescription('List everyone currently connected.'))
    .addSubcommand((s) => s.setName('lookup').setDescription('Staff: look up a connected player’s identifiers.')
      .addStringOption((o) => o.setName('name').setDescription('Part of their in-game name').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPH });

    const status = await fivem.query();
    if (status.disabled) {
      return interaction.editReply({ embeds: [E.warn('Server queries are off', 'Set `SERVER_QUERY_ENABLED=true` in the bot’s `.env`.')] });
    }
    if (!status.online) {
      return interaction.editReply({ embeds: [E.error('Server offline', 'Nothing to list — the city is not responding.')] });
    }

    if (interaction.options.getSubcommand() === 'lookup') return lookup(interaction, status);

    if (!status.list.length) {
      return interaction.editReply({ embeds: [E.info('Empty city', `The server is up but nobody is connected. Be the first — ${status.players}/${status.max}.`)] });
    }

    const names = status.list
      .map((p) => `\`${String(p.id).padStart(3, ' ')}\` ${fivem.stripColors(p.name)}${p.ping ? ` · ${p.ping}ms` : ''}`)
      .sort();

    // Split across fields so a full server doesn't blow the 4096-char limit.
    const embed = E.base(E.COLORS.success)
      .setTitle(`🏙️ In the city — ${status.players}/${status.max}`);

    const chunk = 20;
    for (let i = 0; i < names.length && i < 100; i += chunk) {
      embed.addFields({
        name: i === 0 ? 'Players' : '​',
        value: clamp(names.slice(i, i + chunk).join('\n'), 1000),
        inline: true,
      });
    }
    if (names.length > 100) embed.setFooter({ text: `…and ${names.length - 100} more`, iconURL: E.getBrandIcon() || undefined });

    return interaction.editReply({ embeds: [embed] });
  },
};

async function lookup(interaction, status) {
  if (!isStaff(interaction.member)) {
    return interaction.editReply({ embeds: [E.error('Staff only', 'Identifier lookup is a staff tool.')] });
  }

  const query = interaction.options.getString('name').toLowerCase();
  const matches = status.list.filter((p) => fivem.stripColors(p.name).toLowerCase().includes(query));

  if (!matches.length) return interaction.editReply({ embeds: [E.error('No match', `Nobody connected matches **${clamp(query, 80)}**.`)] });

  const embed = E.base(E.COLORS.info).setTitle(`🔍 ${matches.length} match${matches.length === 1 ? '' : 'es'}`);
  for (const p of matches.slice(0, 5)) {
    const ids = (p.identifiers || []).join('\n');
    const license = (p.identifiers || []).find((i) => i.startsWith('license:'));
    const discordId = license ? db.userByLicense(license) : null;
    embed.addFields({
      name: `[${p.id}] ${fivem.stripColors(p.name)}`,
      value: clamp(`${discordId ? `Discord: <@${discordId}>\n` : ''}Ping: ${p.ping ?? '—'}ms\n\`\`\`${ids || 'no identifiers'}\`\`\``, 1000),
    });
  }
  return interaction.editReply({ embeds: [embed] });
}
