'use strict';
/**
 * Twitch "go live" alerts for community creators.
 *
 * Polls the Helix /streams endpoint with an app access token every 90 seconds
 * and posts to #live-now on an offline→live transition. Entirely optional: with
 * no TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET set, start() is a no-op.
 */
const config = require('./config');
const db = require('./database');
const E = require('./utils/embeds');
const { channelByKey, roleMention } = require('./utils/helpers');

let timer = null;
let token = null;
let tokenExpiry = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiry - 60_000) return token;
  const params = new URLSearchParams({
    client_id: config.twitchClientId,
    client_secret: config.twitchClientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
  if (!res.ok) throw new Error(`token request failed (${res.status})`);
  const data = await res.json();
  token = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return token;
}

async function fetchStreams(logins) {
  if (!logins.length) return [];
  const t = await getToken();
  const out = [];
  // Helix accepts 100 logins per call; we chunk defensively anyway.
  for (let i = 0; i < logins.length; i += 100) {
    const params = new URLSearchParams();
    logins.slice(i, i + 100).forEach((l) => params.append('user_login', l));
    const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
      headers: { 'Client-Id': config.twitchClientId, Authorization: `Bearer ${t}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    out.push(...(data.data || []));
  }
  return out;
}

async function poll(client) {
  const tracked = db.listStreamers().map((s) => s.login);
  if (!tracked.length) return;

  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;

  const streams = await fetchStreams(tracked);
  const liveNow = new Set(streams.map((s) => s.user_login.toLowerCase()));

  for (const s of streams) {
    const login = s.user_login.toLowerCase();
    if (db.isLive(login)) continue;          // already announced this session
    db.setLive(login, s.id);

    const channel = await channelByKey(guild, 'golive');
    if (!channel?.isTextBased()) continue;

    const thumb = (s.thumbnail_url || '').replace('{width}', '1280').replace('{height}', '720');
    const embed = E.base(0x9146FF)
      .setTitle(`🔴 ${s.user_name} is live`)
      .setURL(`https://twitch.tv/${s.user_login}`)
      .setDescription(`**${s.title || 'Streaming now'}**`)
      .addFields(
        { name: 'Playing', value: s.game_name || 'Unknown', inline: true },
        { name: 'Viewers', value: String(s.viewer_count ?? 0), inline: true },
      );
    if (thumb) embed.setImage(`${thumb}?t=${Date.now()}`);

    await channel.send({
      content: `${roleMention('p_live')} **${s.user_name}** just went live — https://twitch.tv/${s.user_login}`,
      embeds: [embed],
    }).catch(() => {});
  }

  // Clear the "already announced" flag once a streamer drops offline.
  for (const login of tracked) {
    if (!liveNow.has(login) && db.isLive(login)) db.clearLive(login);
  }
}

function start(client, intervalMs = 90_000) {
  if (!config.twitchClientId || !config.twitchClientSecret) {
    console.log('[twitch] go-live alerts disabled (no TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET).');
    return;
  }
  stop();
  const run = () => poll(client).catch((err) => console.error('[twitch]', err.message));
  run();
  timer = setInterval(run, intervalMs);
  console.log('[twitch] go-live alerts enabled.');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, poll };
