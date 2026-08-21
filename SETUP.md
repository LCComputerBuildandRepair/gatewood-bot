# First run — Gatewood RP bot

Follow this once, in order. It takes about 20 minutes, most of which is Discord rate-limiting the channel creation.

---

## 1. Create the Discord application

1. Go to **https://discord.com/developers/applications** → **New Application** → name it `Gatewood RP`.
2. **Bot** tab → **Reset Token** → copy the token. This is your `DISCORD_TOKEN`. Treat it like a password — anyone with it controls the bot.
3. Still on the **Bot** tab, scroll to **Privileged Gateway Intents** and turn ON all three:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent

   The bot will not start correctly without these.
4. **General Information** tab → copy the **Application ID**. That is your `CLIENT_ID`.

## 2. Invite the bot

Replace `YOUR_CLIENT_ID` and open this in a browser:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

`permissions=8` is Administrator. The bot genuinely needs it to build a server from nothing — it creates roles above other roles, sets channel overwrites, and manages the guild icon. You can narrow it afterwards if you want.

**Then, in Server Settings → Roles, drag the bot's role to the very top of the list.** Discord will not let it manage any role positioned above its own. This is the single most common reason `/setup` fails.

## 3. Get your server id

In Discord: **User Settings → Advanced → Developer Mode: ON**. Then right-click your server name → **Copy Server ID**. That is your `GUILD_ID`.

## 4. Configure the bot

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
DISCORD_TOKEN=the token from step 1
CLIENT_ID=the application id from step 1
GUILD_ID=the server id from step 3
```

Everything else is optional. The ones worth setting now:

```
SERVER_HOST=your.fxserver.ip     # for the live status embed
SERVER_PORT=30120
CFX_CODE=abcdef                  # the code from https://cfx.re/join/abcdef
SERVER_MAX_SLOTS=64
STORE_URL=https://...            # shown on panels
WEBSITE_URL=https://...
```

## 5. Check and start

```bash
npm install
```

```bash
npm run check
```

You want `✅ Everything checks out.` If it reports problems, fix them first — they would otherwise become cryptic errors from Discord at runtime.

```bash
npm start
```

The log should show:

```
[load] 30 commands loaded.
[ready] Logged in as Gatewood RP#1234
[ready] Registered 30 slash commands to guild ...
[ready] Cached N members of "..."
[fivem] status loop started
[tasks] stat counters, restart countdown and giveaway timers started.
```

## 6. Build the server

In Discord, run these **in order**. Wait for each to say it finished before starting the next.

```
/setup
```
Creates 50 roles, 9 categories, 62 channels, the 3 live stat counters, and posts every panel. **This takes a couple of minutes** — Discord rate-limits channel creation. You will get an ephemeral summary when it's done.

```
/build-departments
```
Creates 7 department wings: 40 rank roles, 7 locked categories, 84 channels. Also slow. You can build them one at a time with `/build-departments department:lspd` if you'd rather.

```
/build-tickets
```
Fast. Pre-creates a category per ticket type so the server looks finished before the first ticket exists.

```
/organize
```
Sorts every category into order.

## 7. Give yourself the top role

`/setup` created a `👑 Owner` role. Assign it to yourself in Server Settings → Members. Staff-gated commands check for these blueprint roles, not just for Administrator.

## 8. Decide on the whitelist

The bot ships in **open** mode: verifying in Discord grants city access immediately. Good for a new server that needs population.

To require an approved application instead:

```
/config whitelist mode:application
/panel verify replace:true
/panel applications replace:true
```

The panels need re-posting because their wording changes with the mode.

## 9. Set your restart schedule

```
/restart schedule times:04:00,10:00,16:00,22:00
```

⚠️ These are the **bot host's** local times. If the bot runs on a VPS in a different timezone than you, enter them in the VPS's timezone.

## 10. Make it yours

- **Rules** — `src/content.js` → `RULEBOOK`. Ten chapters ship ready to use, but read them and change anything that isn't how you want Gatewood run. Then `/panel rules replace:true`.
- **FAQ and welcome** — same file. `/panel faq replace:true`, `/panel welcome replace:true`.
- **Roles and channels** — `src/structure.js`, then re-run `/setup`.
- **Applications** — `src/applications.js`, restart the bot.
- **Logo** — drop `assets/logo.png`, run `npm run avatar`, then `/setup` to set the server icon.

---

## Optional: connect the bot to FXServer

This adds the join/leave feed, chat relay, in-game `/report`, whitelist enforcement and queue priority.

**Only do this if the bot runs on the same machine as FXServer.** The bridge binds to `127.0.0.1` and is not reachable from anywhere else — which is exactly the point.

1. In the bot's `.env`:
   ```
   BRIDGE_ENABLED=true
   BRIDGE_PORT=30122
   BRIDGE_SECRET=<paste a long random string here>
   ```
2. Copy `fivem-resource/gatewood_bridge` into your server's `resources/` folder.
3. Edit `gatewood_bridge/config.lua` and set `Config.Secret` to **exactly** the same string.
4. Add to `server.cfg`:
   ```
   ensure gatewood_bridge
   ```
5. Restart both. The bot log should say `[bridge] listening on http://127.0.0.1:30122`, and `#server-logs` should get a "🟢 Server started" post when FXServer comes up.

**Leave `Config.EnforceWhitelist = false` until you have tested it.** Turn it on only after you have confirmed the bot answers correctly — and note that even then the bridge fails *open* on a 5-second timeout, so a crashed bot can never lock your players out.

For queue priority, open `gatewood_bridge/server.lua`, find the `Config.UsePriority` block, and uncomment the line that matches the queue resource you run.

---

## Optional: Twitch go-live alerts

1. Create an app at **https://dev.twitch.tv/console/apps** (any OAuth redirect URL, e.g. `http://localhost`).
2. Put the Client ID and Client Secret in `.env` as `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`.
3. Restart, then `/streamers add login:<their twitch username>`.

Alerts post to `#live-now` and ping the `🔴 Live Alerts` role.
