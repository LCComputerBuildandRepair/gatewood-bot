Config = {}

-- Where the Discord bot's bridge is listening. If the bot runs on the SAME box
-- as FXServer (recommended), leave this as 127.0.0.1 — the bridge only binds to
-- localhost, so nothing on the internet can reach it.
Config.BotUrl = 'http://127.0.0.1:30122'

-- Must match BRIDGE_SECRET in the bot's .env, exactly.
Config.Secret = 'change-this-to-a-long-random-string'

-- ── Features ────────────────────────────────────────────────────────────────
Config.SendJoinLeave  = true   -- post connects/disconnects to #in-game-feed
Config.RelayChat      = true   -- mirror in-game chat into #in-game-chat
Config.RelayFromDiscord = true -- and push #in-game-chat messages back in game
Config.EnableReport   = true   -- /report in game creates a staff post in Discord

-- Whitelist enforcement. OFF by default: turn it on only once you have tested
-- that the bot answers, or you will lock your whole player base out.
Config.EnforceWhitelist = false
Config.WhitelistDenyMessage =
    'You are not whitelisted for Gatewood RP.\n\n' ..
    'Join our Discord and complete a whitelist application, then try again.'

-- Queue priority. The bridge only READS the number from Discord; hand it to
-- whatever queue resource you run (see the example in server.lua).
Config.UsePriority = true

-- How often (ms) to poll the bot for Discord messages to relay in game.
Config.PollInterval = 3000

-- Chat prefix shown in game for relayed Discord messages.
Config.DiscordChatPrefix = '^5[Discord]^7'
