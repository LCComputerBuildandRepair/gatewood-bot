# Gatewood RP — Discord Bot

An all-in-one Discord bot that **builds and runs the entire Discord** for the Gatewood RP FiveM server.

One `/setup` produces a server that looks like it took a team a month: 50 roles, 9 categories, 62 channels, live stat counters, an interactive rulebook, a whitelist pipeline, a seven-category ticket system, seven fully-permissioned city departments, and a live link to your FXServer.

---

## What it does

### Builds the server
| Command | What it does |
|---|---|
| `/setup` | Roles, categories, channels, permissions, panels, server icon. Idempotent — re-run any time to repair. |
| `/build-departments` | 7 departments × (rank ladder + locked category + 12 channels). LSPD, BCSO, SASP, EMS, DOJ, Mechanic, Weazel News. |
| `/build-tickets` | Pre-creates a category per ticket type. |
| `/organize` | Sorts every category into a sensible order. |
| `/config` | Bind the bot to an **existing** server instead of rebuilding it. |
| `/panel` | Re-post any interactive panel. |
| `/cleanup` · `/reset` | Clear out an old layout, or start over. |

### Runs the server
- **Live status** — a permanent embed in `#server-status` that refreshes every 60s, plus the player count in the bot's presence and three live voice-channel counters (`👥 Members: 412`, `🏙️ In City: 47/64`, `📶 Server: Online`).
- **Interactive rulebook** — 10 chapters, page-turned privately by each member.
- **Verification gate** — everyone lands as Unverified; accepting the rules unlocks the server (and, in open mode, city access too).
- **Applications** — 8 types (whitelist, law enforcement, EMS, DOJ, staff, creator, gang/MC, business), multi-page modals, staff Accept / Deny / Interview with automatic role grants and DM'd decisions.
- **Tickets** — 7 categories, each in its own category with its own staff list, claim button, HTML transcripts filed to `#ticket-logs` and DM'd to the opener.
- **Departments** — hire, promote, demote, fire, and a self-updating roster, all runnable by that department's command staff rather than only by admins.
- **Organisations** — `/org create` gives an approved gang, MC or business its own role, private category and directory listing.
- **Moderation** — warn / notes / timeout / kick / ban / purge / lock / slowmode, all logged and DM'd, with hierarchy guards.
- **Automod** — invite links, rival-server links, mass mentions, spam. Staff exempt, toggleable.
- **Logging** — mod, member joins/leaves, message edits/deletes, voice, server health.
- **Queue priority** — donator and creator tiers, time-limited or permanent, answered live to FXServer.
- **Account linking** — `/link me` proves you're connected as a character and ties it to your Discord.
- **Staff duty** — clock on/off, who's online right now, weekly and all-time hours, activity leaderboard.
- **Community** — activity levels with reward roles, starboard highlights, join-to-create voice rooms, suggestion voting with threads, giveaways, polls, Twitch go-live alerts.
- **Restart schedule** — announces 15 / 5 / 1 minutes before each daily restart, pinging only the people who asked for it.

### Talks to your FiveM server
The optional bridge in `fivem-resource/gatewood_bridge` gives you:
- join / leave feed in `#in-game-feed`
- two-way chat relay with `#in-game-chat`
- in-game `/report` landing in `#reports` with the online staff pinged
- whitelist enforcement answered from Discord roles
- queue priority handed to your queue resource

It binds to `127.0.0.1` only and requires a shared secret. **It fails open** — if the bot is down, players still connect.

---

## Requirements

- **Node 18 or newer** (`node -v`)
- A Discord application with a bot user
- Three **privileged intents** enabled in the Developer Portal → *Bot* → *Privileged Gateway Intents*:
  - Server Members Intent
  - Message Content Intent
  - Presence Intent *(used to ping only staff who are actually online)*
- The bot's role dragged to the **top** of the role list

---

## Install

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env` — at minimum `DISCORD_TOKEN`, `CLIENT_ID` and `GUILD_ID`. Then:

```bash
npm run check
```

That runs a full offline self-test: every module loads, every slash command builds a valid payload, every modal fits Discord's limits. Fix anything it reports before starting.

```bash
npm start
```

Then in Discord, run **`/setup`** → **`/build-departments`** → **`/build-tickets`** → **`/organize`**.

Full first-run walkthrough: **[SETUP.md](SETUP.md)**
Hosting it 24/7: **[DEPLOY.md](DEPLOY.md)**

---

## Configuration

Everything the bot builds lives in **`src/structure.js`** — roles, categories, channels, department rank ladders. Edit it, re-run `/setup`, and the server reconciles. Nothing is ever deleted by `/setup`.

The written content lives in **`src/content.js`** — the rulebook, welcome message, FAQ and connection guide. The rules that ship are a solid, ready-to-run ruleset for a serious RP city, but **read them through and make them yours**. After editing, re-post with `/panel rules replace:true`.

Applications are in **`src/applications.js`**, ticket types in **`src/tickets.js`**.

### Runtime settings (no restart needed)

```
/config view                          # every binding and setting
/config whitelist mode:application    # or mode:open
/config toggle feature:automod on:false
/config applications type:whitelist open:false
/restart schedule times:04:00,10:00,16:00,22:00
```

### Branding

Drop your logo at `assets/logo.png`. Then:
- `npm run avatar` sets the bot's avatar from it
- `/setup` sets the server icon from it
- every embed picks it up automatically

Colours come from `BRAND_COLOR` / `ACCENT_COLOR` in `.env` (hex, no `#`).

---

## Layout

```
index.js                     entry point — loads commands & events, logs in
src/
  config.js                  .env parsing
  database.js                JSON store (data/db.json) — no native deps
  structure.js               THE BLUEPRINT: roles, categories, channels, departments
  content.js                 rulebook, welcome, FAQ, connection guide
  applications.js            application definitions
  tickets.js                 ticket type definitions
  panels.js                  interactive panel builders
  components.js              button / select / modal router
  fivem.js                   FXServer status queries + status loop
  bridge.js                  localhost HTTP API for the in-game resource
  tasks.js                   stat counters, restart countdown, giveaway draws
  twitch.js                  go-live alerts
  automod.js                 invite / spam / mass-mention filter
  transcript.js              HTML ticket transcripts
  services/                  ticket + application lifecycles
  commands/                  30 slash commands
  events/                    9 gateway event handlers
  utils/                     embeds + shared helpers
fivem-resource/
  gatewood_bridge/           drop this into your FXServer resources
scripts/selftest.js          offline validation (npm run check)
```

---

## Commands

Run `/help` in Discord — it shows only what the person asking is allowed to use.

**Everyone:** `/status` `/players` `/link` `/rank` `/leaderboard` `/userinfo` `/serverinfo` `/help` `/priority check` `/staff online`

**Staff:** `/mod` `/ticket` `/application` `/department` `/org` `/priority` `/staff` `/announce` `/giveaway` `/poll` `/say` `/embed`

**Admin:** `/setup` `/build-departments` `/build-tickets` `/organize` `/config` `/panel` `/restart` `/streamers` `/cleanup` `/reset`

---

## Troubleshooting

**`/setup` fails partway.** The bot's role is not above the roles it is trying to create, or it lacks Manage Roles / Manage Channels. Fix and re-run — it picks up where it left off.

**Commands don't appear.** They register to `GUILD_ID` on startup. Check the startup log says `Registered N slash commands`, and that `GUILD_ID` is your server's id.

**"Unknown interaction" errors.** Almost always clock skew on the host. On Windows: `w32tm /resync`.

**Status embed says offline but the server is up.** `SERVER_HOST`/`SERVER_PORT` must reach the FXServer *game* port (usually 30120), not the txAdmin port. If the bot is on a different machine, that port has to be reachable from it.

**Tickets don't ping anyone.** Enable the Presence Intent — without it the bot can't tell who's online and falls back to a plain role ping.
