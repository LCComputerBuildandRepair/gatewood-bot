# Connecting the bot to the website

The Gatewood website shows a live player count. It cannot get that number on its
own: the cfx.re master list refuses browser requests (and 404s whenever the
server isn't listed, which is not the same as being down), and a browser on an
HTTPS page is not allowed to call a plain HTTP game port.

This bot already sits on the same box as FXServer and already asks it for the
player count every minute. `src/statusapi.js` publishes that answer.

## What it exposes

`GET http://<vps>:30123/status` returns JSON:

    online, players, max, percent, queued, hostname, gametype, mapname,
    resources, vars (allow-listed), averagePing, onlineSince, restarts,
    nextRestart, discord { members, online }, connect { cfx, address },
    playerList (only if you opt in), updatedAt

`GET /health` returns `{ ok: true }` for uptime monitors.

Everything there is already public to anyone who joins the server. There are no
write endpoints, no secrets, no player identifiers, and nothing it returns can
change anything. Requests are rate limited to 120/minute per IP and results are
cached for 15 seconds so the website can never hammer the game server.

This is deliberately different from `src/bridge.js`, which binds to 127.0.0.1
only and requires a secret, because that one CAN change things.

## Turning it on (on the VPS)

1. Add to `.env`:

       STATUS_API_ENABLED=true
       STATUS_API_PORT=30123
       STATUS_API_HOST=0.0.0.0

   Optional:

       STATUS_API_ORIGIN=https://your-site.netlify.app   # lock it to your site
       STATUS_API_SHOW_PLAYERS=true                      # publish player names
       STATUS_API_CACHE_MS=15000

2. Open the port in the firewall:

       sudo ufw allow 30123/tcp          # Ubuntu/Debian
       # or on Windows Server:
       netsh advfirewall firewall add rule name="Gatewood status API" dir=in action=allow protocol=TCP localport=30123

   If your VPS host has its own firewall/security group (Oracle, AWS, OVH),
   open it there too.

3. Restart the bot. You should see:

       [statusapi] public status API on http://0.0.0.0:30123/status

4. Check it from your own PC:

       curl http://<your-vps-ip>:30123/status

   You should get JSON with `"online": true` and a real player count.

## Pointing the website at it

In Netlify → Site configuration → Environment variables, add:

    STATUS_API_URL = http://<your-vps-ip>:30123/status

Then redeploy (Deploys → Trigger deploy). The website's `/api/server-status`
function asks this endpoint first and falls back to cfx.re if it can't reach it.

The VPS address lives only in that environment variable — it is never committed
to the website repo and is never visible to visitors, because the call happens
on Netlify's servers, not in the browser.

## Player names

`STATUS_API_SHOW_PLAYERS=false` by default. Names are already visible to anyone
in the city, but publishing them on a public web page is a separate decision —
some players will not expect it. Turn it on only if you want the "in the city
right now" list on the status page.
