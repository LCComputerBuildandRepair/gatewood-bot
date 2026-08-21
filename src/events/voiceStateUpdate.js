'use strict';
/**
 * Join-to-create voice rooms plus voice activity logging.
 *
 * Joining the "Create a Room" channel spawns a personal voice channel next to
 * it, moves the member in, and gives them control of it. The room deletes
 * itself the moment it empties.
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const E = require('../utils/embeds');
const { logTo } = require('../utils/helpers');

const P = PermissionFlagsBits;

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;

    // ── Join-to-create ──
    const hubId = db.channelId('vc_create');
    if (hubId && newState.channelId === hubId && newState.member) {
      await spawnRoom(guild, newState);
    }

    // ── Clean up an emptied temp room ──
    if (oldState.channelId && db.isTempVc(oldState.channelId)) {
      const ch = guild.channels.cache.get(oldState.channelId);
      if (ch && ch.members.size === 0) {
        db.removeTempVc(ch.id);
        await ch.delete('Temporary voice room emptied').catch(() => {});
      }
    }

    // ── Voice logging ──
    if (oldState.channelId === newState.channelId) return;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    let title;
    let detail;
    if (!oldState.channelId) { title = '🔊 Joined voice'; detail = `<#${newState.channelId}>`; }
    else if (!newState.channelId) { title = '🔇 Left voice'; detail = `<#${oldState.channelId}>`; }
    else { title = '🔀 Switched voice'; detail = `<#${oldState.channelId}> → <#${newState.channelId}>`; }

    await logTo(guild, 'voice_logs', E.base(E.COLORS.info)
      .setTitle(title)
      .setDescription(`<@${member.id}> — ${detail}`));
  },
};

async function spawnRoom(guild, state) {
  const member = state.member;
  const hub = guild.channels.cache.get(state.channelId);

  const room = await guild.channels.create({
    name: `🔊 ${member.displayName}'s room`,
    type: ChannelType.GuildVoice,
    parent: hub?.parentId || null,
    userLimit: 10,
    permissionOverwrites: [
      ...(hub?.permissionOverwrites.cache.map((o) => ({
        id: o.id, allow: o.allow.toArray(), deny: o.deny.toArray(),
      })) || []),
      {
        id: member.id,
        allow: [P.ViewChannel, P.Connect, P.Speak, P.ManageChannels, P.MoveMembers, P.MuteMembers],
      },
    ],
    reason: `Join-to-create room for ${member.user.tag}`,
  }).catch(() => null);

  if (!room) return;
  db.addTempVc(room.id, member.id);
  await member.voice.setChannel(room).catch(() => {});
}
