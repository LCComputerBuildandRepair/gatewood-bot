# Running the bot 24/7

The bot has **no native dependencies** — just `discord.js` and `dotenv` — so it installs cleanly on Windows, Linux and ARM boxes without a compiler.

Pick whichever matches where you host.

---

## Windows (same box as FXServer)

The simplest option, and the one that lets you use the in-game bridge.

### Quick start

Double-click **`start.bat`**. It restarts the bot automatically if it crashes.

### Proper: PM2 as a service

```powershell
npm install -g pm2 pm2-windows-startup
```

```powershell
pm2-startup install
```

```powershell
cd C:\path\to\gatewood-bot; pm2 start index.js --name gatewood-bot; pm2 save
```

Useful afterwards:

```powershell
pm2 logs gatewood-bot --lines 100
```

```powershell
pm2 restart gatewood-bot
```

---

## Linux VPS / Oracle Cloud free tier

Works fine on the ARM/Ampere free tier — nothing here needs to compile.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
```

```bash
cd ~ && git clone <your-repo> gatewood-bot && cd gatewood-bot && npm install
```

Create `.env` on the server (never commit it):

```bash
nano .env
```

Then:

```bash
npm run check && npm start
```

Once you've confirmed it connects, hand it to PM2:

```bash
npm install -g pm2 && pm2 start index.js --name gatewood-bot && pm2 save && pm2 startup
```

Run the command `pm2 startup` prints, so the bot survives a reboot.

---

## Updating

If you keep the code in git:

```bash
cd ~/gatewood-bot && git fetch origin && git reset --hard origin/main && npm install && pm2 restart gatewood-bot
```

The `git fetch` matters. A bare `git reset --hard origin/main` uses a stale remote ref and silently keeps the old code — the symptom is the startup log reporting the wrong command count.

If you copy files by hand instead, **do not overwrite `.env` or `data/`**. `data/db.json` holds every warning, application, link, level and organisation.

---

## Backups

Everything the bot remembers is one file: **`data/db.json`**. Back it up.

Linux, daily at 4am:

```bash
(crontab -l 2>/dev/null; echo "0 4 * * * cp ~/gatewood-bot/data/db.json ~/backups/db-\$(date +\%F).json") | crontab -
```

Windows: point any backup tool at `data\db.json`, or copy it before each update.

---

## Running alongside other bots

Several bots can share one machine happily. Two things must be unique per bot:

- its **own Discord token** (two processes cannot share one)
- its **bridge port** if more than one uses the in-game bridge (`BRIDGE_PORT`)

Give each a distinct PM2 name (`pm2 start index.js --name gatewood-bot`) so `pm2 restart` hits the right one.

---

## Health checks

The bot logs its own state to `#server-logs` — FXServer going up or down, and bridge events. For the process itself:

```bash
pm2 status
```

If the bridge is enabled, this returns `{"ok":true,...}` when the bot is alive:

```bash
curl http://127.0.0.1:30122/health
```

---

## Security notes

- `.env` holds your bot token and bridge secret. It is in `.gitignore` — keep it that way. If it ever leaks, reset the token in the Developer Portal immediately.
- The bridge binds to `127.0.0.1` only and requires the `X-Auth` header. Do not change the bind address to `0.0.0.0`; if the bot and FXServer are on different machines, put them on a private network or a tunnel instead of exposing the port.
- `data/db.json` contains member ids, warnings, application answers and in-game licenses. Treat backups of it as personal data.
