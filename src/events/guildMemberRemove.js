'use strict';
const E = require('../utils/embeds');
const { logTo, ts, clamp } = require('../utils/helpers');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const roles = member.roles?.cache
      ?.filter((r) => r.id !== member.guild.id)
      .map((r) => r.name)
      .join(', ');

    await logTo(member.guild, 'member_logs', E.base(E.COLORS.dark)
      .setTitle('🚪 Member left')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Member', value: `<@${member.id}>\n\`${member.user.tag}\``, inline: true },
        { name: 'Joined', value: member.joinedTimestamp ? ts(member.joinedTimestamp) : 'Unknown', inline: true },
        { name: 'Member count', value: String(member.guild.memberCount), inline: true },
        { name: 'Roles held', value: clamp(roles || 'None', 1000) },
      ));
  },
};
