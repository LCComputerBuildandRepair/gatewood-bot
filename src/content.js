'use strict';
/**
 * All the long-form written content the bot posts: the rulebook, the welcome
 * message, the FAQ and the connection guide.
 *
 * These are written to be a solid, ready-to-run ruleset for a serious GTA V RP
 * city — but they are YOUR rules, so read them through and edit anything that
 * doesn't match how you want Gatewood run. Re-post after editing with
 * `/panel rules`, `/panel welcome`, `/panel faq` or `/panel connect`.
 */

// ── Rulebook ─────────────────────────────────────────────────────────────────
// Rendered as an interactive, page-turning book in #rules (see panels.js).
const RULEBOOK = [
  {
    title: 'Chapter 1 — The Golden Rules',
    body: [
      '**1.1 Roleplay comes first.** Every action your character takes must make sense for a real person in that situation. If you would not do it in real life with real consequences, your character should not do it either.',
      '**1.2 Value your life.** Your character fears death, injury and pain at all times. This applies to every scenario, including when you are armed.',
      '**1.3 Never break character.** Do not discuss out-of-character topics, ping, streams, or staff while in the city. Use `/report` or a Discord ticket instead.',
      '**1.4 Don’t ruin someone else’s scene.** Interrupting, hijacking or trolling another player’s roleplay is a removable offence.',
      '**1.5 Common sense outranks the rulebook.** If something is clearly against the spirit of roleplay, staff will treat it that way even if no numbered rule covers it.',
    ],
  },
  {
    title: 'Chapter 2 — Conduct & Community',
    body: [
      '**2.1 Zero tolerance** for racism, sexism, homophobia, transphobia, ableism or hate speech of any kind — in character or out.',
      '**2.2 No harassment, stalking, doxxing or threats.** This extends to DMs and to platforms outside our Discord.',
      '**2.3 No sexual content involving minors, no depictions of sexual assault, no torture porn.** Instant permanent ban, no appeal.',
      '**2.4 Extreme roleplay** (torture, kidnapping, heavy trauma) requires the clear consent of everyone in the scene, asked *before* it begins.',
      '**2.5 Respect staff decisions.** Disagree in a ticket, calmly and with evidence. Arguing in public channels gets you muted.',
      '**2.6 18+ community.** You must be 18 or older to be whitelisted here.',
    ],
  },
  {
    title: 'Chapter 3 — Metagaming & Powergaming',
    body: [
      '**3.1 Metagaming** is using information your character has no way of knowing — streams, Discord, third-party voice, another character’s life. It is not allowed in any form.',
      '**3.2 Stream sniping** is metagaming. Watching a creator and acting on what you see is an instant removal.',
      '**3.3 Powergaming** is forcing an outcome another player cannot realistically counter, or using mechanics your character shouldn’t know about.',
      '**3.4 No "/me" abuse.** Emotes describe what your character does, not what happens to someone else.',
      '**3.5 Injuries stick.** If you are shot, downed or hospitalised, you roleplay the recovery. No walking it off.',
    ],
  },
  {
    title: 'Chapter 4 — New Life Rule',
    body: [
      '**4.1 If your character dies and respawns, that character forgets the events leading to their death.** You may not return to the scene, seek revenge, or act on anything learned in the 30 minutes before death.',
      '**4.2 NLR applies for 30 minutes** and covers the whole area of the incident.',
      '**4.3 If you are revived by EMS**, NLR does not apply — but you must roleplay the injury and follow medical instructions.',
      '**4.4 Do not force a respawn** to escape an active scene. That is combat logging (see Chapter 8).',
    ],
  },
  {
    title: 'Chapter 5 — Combat: RDM, VDM & Escalation',
    body: [
      '**5.1 RDM** (Random Deathmatch) — killing without prior roleplay or a valid in-character reason. Not allowed.',
      '**5.2 VDM** (Vehicle Deathmatch) — using a vehicle as a weapon without justification. Not allowed.',
      '**5.3 Escalation is required.** Every hostile act needs a build-up: interaction, demand, threat, then force. Shooting first is almost never valid.',
      '**5.4 Fear RP applies.** With a gun pointed at you at close range, you comply. You do not out-draw a drawn weapon.',
      '**5.5 No combat storing/logging** of weapons, vehicles or your character during an active scene.',
      '**5.6 Green zones** — hospitals, police stations, government buildings and their car parks are non-hostile at all times.',
    ],
  },
  {
    title: 'Chapter 6 — Criminal Roleplay',
    body: [
      '**6.1 Robberies need a reason and a story.** Money is a by-product of the roleplay, never the point of it.',
      '**6.2 Hostages must be real players** who have agreed to the scene. NPC hostages do not count for demands.',
      '**6.3 Maximum group size for organised crime is 6** unless a staff-approved event says otherwise.',
      '**6.4 Cop-baiting** — provoking police purely to start a chase — is not allowed.',
      '**6.5 No robbing** brand-new characters, players who are clearly starting out, or anyone in a green zone.',
      '**6.6 Gangs and MCs must be registered** through the Discord application before claiming territory or running organised crime.',
    ],
  },
  {
    title: 'Chapter 7 — Vehicles & Driving',
    body: [
      '**7.1 Drive realistically.** Your car is not a rally car unless you are in a pursuit, and even then it obeys physics.',
      '**7.2 No off-roading in supercars,** no driving up mountains in a sedan, no using terrain to escape.',
      '**7.3 Crashes have consequences.** A high-speed wreck means injury and a call to EMS, not a handbrake turn and a getaway.',
      '**7.4 No vehicle surfing or ramming** as a combat tactic.',
      '**7.5 Emergency vehicles** are for on-duty personnel only.',
    ],
  },
  {
    title: 'Chapter 8 — Exploits & Fair Play',
    body: [
      '**8.1 Any cheat, mod menu, injector or macro is a permanent ban** on first offence, appeal denied.',
      '**8.2 Found a bug or a duplication exploit? Report it.** Using it is a ban; reporting it earns a reward.',
      '**8.3 Combat logging** — disconnecting during an active scene — is treated as the outcome you were avoiding, plus a suspension.',
      '**8.4 No alt accounts** to evade bans, queue faster, or stack an organisation.',
      '**8.5 Real-money trading** of in-game assets is forbidden and gets both parties banned.',
    ],
  },
  {
    title: 'Chapter 9 — Voice, Streaming & Media',
    body: [
      '**9.1 A working microphone is required.** Text-only roleplay is not permitted in the city.',
      '**9.2 No voice changers** that make you unintelligible, and no soundboards in-character.',
      '**9.3 Streamers must run a 60-second delay** or accept full responsibility for stream-sniping incidents.',
      '**9.4 Clip anything you report.** Staff act on evidence, and a clip resolves a report in minutes instead of days.',
      '**9.5 Do not post other people’s roleplay** in a mocking or harassing way, on any platform.',
    ],
  },
  {
    title: 'Chapter 10 — Staff, Reports & Appeals',
    body: [
      '**10.1 Report in a ticket, not in chat.** Use the ticket panel in the support channel.',
      '**10.2 One report per incident.** Include names, time, and a clip.',
      '**10.3 Do not argue with a staff ruling in public.** Appeal it through a Ban Appeal ticket.',
      '**10.4 Staff are players too** — but they will never use their position for an in-character advantage. If you believe one has, open a **Report a Staff Member** ticket; only senior leadership can see it.',
      '**10.5 Punishments escalate:** verbal → written warning → kick → temporary ban → permanent ban. Severity can skip steps.',
      '**10.6 Ignorance of the rules is not a defence.** By connecting, you agree to all of the above.',
    ],
  },
];

// ── Welcome ──────────────────────────────────────────────────────────────────
const WELCOME = {
  title: 'Welcome to Gatewood RP',
  intro:
    'Gatewood is a serious-roleplay city built for people who want their character to *matter*. ' +
    'Real consequences, real stories, and a staff team that actually shows up.',
  steps: [
    '**1.** Read the rulebook in the rules channel — all ten chapters.',
    '**2.** Head to the verify channel and accept the rules to unlock the server.',
    '**3.** Grab your notification and interest roles in the get-roles channel.',
    '**4.** Apply for city access in the applications channel (if the whitelist is on).',
    '**5.** Follow the connection guide and we will see you in the city.',
  ],
  footerNote: 'Stuck on any of it? Open a ticket — someone from the team will answer.',
};

// ── FAQ ──────────────────────────────────────────────────────────────────────
const FAQ = [
  { q: 'Do I need to be whitelisted?', a: 'Check the applications channel — if whitelist mode is on, you need an approved application before you can connect. If it is off, verifying in Discord is enough.' },
  { q: 'How old do I have to be?', a: 'Gatewood is an 18+ community.' },
  { q: 'Do I need a microphone?', a: 'Yes. Voice is how roleplay happens here; text-only play is not permitted in the city.' },
  { q: 'How long do applications take?', a: 'Usually under 48 hours. You get a DM the moment a decision is made — check your DMs are open.' },
  { q: 'My application was denied. Can I reapply?', a: 'Yes, after 7 days. Read the denial reason first — reapplying with the same answers gets the same result.' },
  { q: 'How do I join a department?', a: 'Get whitelisted first, then apply in the applications channel. Departments interview separately.' },
  { q: 'Can I start a gang or a business?', a: 'Yes — register it through the applications channel. Approved organisations get their own private category here in Discord.' },
  { q: 'What is priority queue?', a: 'Donators, creators and staff skip part of the queue. Ask in a Donation ticket if your perks have not applied.' },
  { q: 'The server is down / I cannot connect.', a: 'Check the server-status channel first — it updates automatically. If it says online and you still cannot connect, open a support ticket.' },
  { q: 'How do I report someone?', a: 'Open a Report a Player ticket with the person’s name, roughly when it happened, and a clip. Clips resolve reports fast.' },
];

// ── Connection guide ─────────────────────────────────────────────────────────
const CONNECT_STEPS = [
  '**1. Own a legitimate copy of GTA V** on Steam, Rockstar or Epic. Launch it once and reach the story mode menu.',
  '**2. Install FiveM** from **https://fivem.net** and let it finish its first-run update.',
  '**3. Link your accounts** — open FiveM, sign in with your CFX/Discord account.',
  '**4. Verify here in Discord** and, if the whitelist is on, get your application approved.',
  '**5. Connect to Gatewood** using the direct connect address or the cfx.re link below.',
  '**6. Set a push-to-talk key** in the FiveM settings before your first scene.',
];

module.exports = { RULEBOOK, WELCOME, FAQ, CONNECT_STEPS };
