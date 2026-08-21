--[[
    gatewood_bridge — server side

    Talks to the Gatewood RP Discord bot over localhost HTTP. Everything is
    fire-and-forget except the whitelist check, which blocks the connection
    deferral until the bot answers (or a 5-second timeout lets them through,
    so a crashed bot can never lock out your whole player base).
]]

local function post(endpoint, payload, cb)
    PerformHttpRequest(Config.BotUrl .. '/' .. endpoint, function(status, body)
        if cb then cb(status, body) end
        if status ~= 200 and status ~= 0 then
            print(('[gatewood_bridge] %s -> HTTP %s'):format(endpoint, tostring(status)))
        end
    end, 'POST', json.encode(payload or {}), {
        ['Content-Type'] = 'application/json',
        ['X-Auth'] = Config.Secret,
    })
end

local function get(endpoint, cb)
    PerformHttpRequest(Config.BotUrl .. '/' .. endpoint, function(status, body)
        cb(status, body)
    end, 'GET', '', {
        ['Content-Type'] = 'application/json',
        ['X-Auth'] = Config.Secret,
    })
end

--- Pull one identifier of a given prefix off a player.
local function getIdentifier(src, prefix)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, #prefix) == prefix then return id end
    end
    return nil
end

-- ── Connect: whitelist + priority ───────────────────────────────────────────
AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
    local src = source
    local license = getIdentifier(src, 'license:')
    local discord = getIdentifier(src, 'discord:')
    local discordId = discord and discord:gsub('discord:', '') or nil

    deferrals.defer()
    Wait(0)
    deferrals.update('Checking your Gatewood records…')

    local answered = false

    local query = '/whitelist?'
    if license then query = query .. 'license=' .. license end
    if discordId then query = query .. (license and '&' or '') .. 'discord=' .. discordId end

    get(query:sub(2), function(status, body)
        if answered then return end
        answered = true

        local ok, data = pcall(json.decode, body or '')
        if status ~= 200 or not ok or not data then
            -- Bot unreachable: fail OPEN. A broken bot must never close the city.
            print('[gatewood_bridge] whitelist check failed, allowing connection')
            deferrals.done()
            return
        end

        if Config.EnforceWhitelist and not data.allowed then
            deferrals.done(Config.WhitelistDenyMessage)
            return
        end

        if Config.UsePriority and data.priority and data.priority > 0 then
            -- Hand the number to your queue resource here. Two common ones:
            --   exports['connectqueue']:AddPriority(license, data.priority)
            --   TriggerEvent('queue:addPriority', license, data.priority)
            -- Uncomment the line that matches what you run.
            SetConvarServerInfo('gatewood_last_priority', tostring(data.priority))
        end

        deferrals.done()
    end)

    -- Never hang a player on a dead bot.
    SetTimeout(5000, function()
        if not answered then
            answered = true
            print('[gatewood_bridge] whitelist check timed out, allowing connection')
            deferrals.done()
        end
    end)
end)

-- ── Join / leave feed ───────────────────────────────────────────────────────
AddEventHandler('playerJoining', function()
    if not Config.SendJoinLeave then return end
    local src = source
    local discord = getIdentifier(src, 'discord:')
    post('join', {
        name = GetPlayerName(src),
        id = src,
        license = getIdentifier(src, 'license:'),
        discord = discord and discord:gsub('discord:', '') or nil,
    })
end)

AddEventHandler('playerDropped', function(reason)
    if not Config.SendJoinLeave then return end
    local src = source
    post('leave', {
        name = GetPlayerName(src),
        license = getIdentifier(src, 'license:'),
        reason = reason,
    })
end)

-- ── Chat relay: game → Discord ──────────────────────────────────────────────
AddEventHandler('chatMessage', function(src, name, message)
    if not Config.RelayChat then return end
    if message:sub(1, 1) == '/' then return end -- commands stay in game
    post('chat', { name = GetPlayerName(src) or name, message = message })
end)

-- ── Chat relay: Discord → game ──────────────────────────────────────────────
if Config.RelayFromDiscord then
    CreateThread(function()
        while true do
            Wait(Config.PollInterval)
            get('outbound', function(status, body)
                if status ~= 200 then return end
                local ok, data = pcall(json.decode, body or '')
                if not ok or not data or not data.messages then return end
                for _, msg in ipairs(data.messages) do
                    TriggerClientEvent('chat:addMessage', -1, {
                        color = { 88, 101, 242 },
                        args = { ('%s %s'):format(Config.DiscordChatPrefix, msg.author), msg.content },
                    })
                end
            end)
        end
    end)
end

-- ── /report ─────────────────────────────────────────────────────────────────
if Config.EnableReport then
    RegisterCommand('report', function(src, args)
        if src == 0 then return end
        if #args < 2 then
            TriggerClientEvent('chat:addMessage', src, {
                color = { 255, 80, 80 },
                args = { '[Report]', 'Usage: /report <player name or id> <what happened>' },
            })
            return
        end

        local target = args[1]
        table.remove(args, 1)

        post('report', {
            name = GetPlayerName(src),
            license = getIdentifier(src, 'license:'),
            target = target,
            reason = table.concat(args, ' '),
        })

        TriggerClientEvent('chat:addMessage', src, {
            color = { 80, 255, 120 },
            args = { '[Report]', 'Sent to staff. Someone will be with you shortly — stay in character.' },
        })
    end, false)
end

-- ── Startup / shutdown notices ──────────────────────────────────────────────
AddEventHandler('onResourceStart', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if Config.Secret == 'change-this-to-a-long-random-string' then
        print('^1[gatewood_bridge] Config.Secret is still the default — set it to match BRIDGE_SECRET in the bot .env.^7')
    end
    post('log', { title = '🟢 Server started', message = 'FXServer is up and the bridge is connected.', level = 'info' })
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    post('log', { title = '🔴 Bridge stopped', message = 'The gatewood_bridge resource was stopped.', level = 'warn' })
end)
