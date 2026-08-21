'use strict';
/**
 * Application definitions.
 *
 * Discord modals allow a maximum of 5 inputs, so longer applications are split
 * into `pages`: the member fills page 1, gets a "Continue" button, fills page 2,
 * and only then is the application posted to staff for review.
 *
 * `grants` is the blueprint role key handed out automatically on Accept.
 * `reviewKeys` are the role keys allowed to Accept/Deny it.
 */

const APPLICATIONS = [
  {
    key: 'whitelist',
    label: 'Whitelist / City Access',
    emoji: '🎟️',
    description: 'Apply for access to the city. Required while whitelist mode is on.',
    grants: 'whitelist',
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin', 'srmod', 'mod'],
    color: 0x22C55E,
    pages: [
      [
        { id: 'age', label: 'How old are you? (OOC)', style: 'short', max: 10 },
        { id: 'experience', label: 'Your roleplay experience', style: 'paragraph', max: 800,
          placeholder: 'Servers you have played on, how long you have roleplayed, etc.' },
        { id: 'mic', label: 'Do you have a working microphone?', style: 'short', max: 20, placeholder: 'Yes / No' },
        { id: 'found', label: 'How did you find Gatewood RP?', style: 'short', max: 200 },
        { id: 'rules', label: 'Have you read the rules in full?', style: 'short', max: 20, placeholder: 'Yes / No' },
      ],
      [
        { id: 'char_name', label: 'Character full name', style: 'short', max: 100 },
        { id: 'backstory', label: 'Character backstory', style: 'paragraph', max: 1500,
          placeholder: 'Who are they, where are they from, why are they in Gatewood?' },
        { id: 'goals', label: 'What are your character’s goals here?', style: 'paragraph', max: 800 },
        { id: 'define_rdm', label: 'In your own words, define RDM and VDM', style: 'paragraph', max: 600 },
        { id: 'define_fearrp', label: 'In your own words, define Fear RP', style: 'paragraph', max: 600 },
      ],
    ],
  },
  {
    key: 'police',
    label: 'Law Enforcement (LSPD / BCSO / SASP)',
    emoji: '🚓',
    description: 'Apply to join a law enforcement department.',
    grants: null, // department rank is assigned by command staff after interview
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin', 'dept_lspd', 'dept_bcso', 'dept_sasp'],
    color: 0x1D4ED8,
    pages: [
      [
        { id: 'dept', label: 'Which department? (LSPD / BCSO / SASP)', style: 'short', max: 40 },
        { id: 'char_name', label: 'Character full name', style: 'short', max: 100 },
        { id: 'leo_exp', label: 'Prior law enforcement RP experience', style: 'paragraph', max: 1000 },
        { id: 'availability', label: 'Availability (days / hours, timezone)', style: 'short', max: 200 },
        { id: 'why', label: 'Why should we hire you?', style: 'paragraph', max: 1000 },
      ],
      [
        { id: 'scenario_pursuit', label: 'Scenario: a pursuit enters a crowded area', style: 'paragraph', max: 1200,
          placeholder: 'Walk us through how you would handle it.' },
        { id: 'scenario_force', label: 'Scenario: when is lethal force justified?', style: 'paragraph', max: 1200 },
        { id: 'discipline', label: 'Have you ever been removed from a department?', style: 'paragraph', max: 600 },
      ],
    ],
  },
  {
    key: 'ems',
    label: 'EMS / Fire Department',
    emoji: '🚑',
    description: 'Apply to join EMS or the fire department.',
    grants: null,
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin', 'dept_ems'],
    color: 0xDC2626,
    pages: [
      [
        { id: 'char_name', label: 'Character full name', style: 'short', max: 100 },
        { id: 'med_exp', label: 'Prior medical/EMS RP experience', style: 'paragraph', max: 1000 },
        { id: 'availability', label: 'Availability (days / hours, timezone)', style: 'short', max: 200 },
        { id: 'why', label: 'Why do you want to join EMS?', style: 'paragraph', max: 1000 },
        { id: 'scenario', label: 'Scenario: multi-casualty crash, you are alone', style: 'paragraph', max: 1200 },
      ],
    ],
  },
  {
    key: 'doj',
    label: 'Department of Justice',
    emoji: '⚖️',
    description: 'Apply to serve as a judge, attorney or court clerk.',
    grants: null,
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin', 'dept_doj'],
    color: 0x7C3AED,
    pages: [
      [
        { id: 'role', label: 'Desired role (Judge / Attorney / Clerk)', style: 'short', max: 60 },
        { id: 'char_name', label: 'Character full name', style: 'short', max: 100 },
        { id: 'legal_exp', label: 'Prior legal RP experience', style: 'paragraph', max: 1000 },
        { id: 'penal', label: 'How familiar are you with our penal code?', style: 'paragraph', max: 800 },
        { id: 'why', label: 'Why the DOJ?', style: 'paragraph', max: 1000 },
      ],
    ],
  },
  {
    key: 'staff',
    label: 'Staff Team',
    emoji: '🛡️',
    description: 'Apply to join the Gatewood staff team.',
    grants: null,
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin'],
    color: 0xF97316,
    pages: [
      [
        { id: 'age', label: 'How old are you? (OOC)', style: 'short', max: 10 },
        { id: 'timezone', label: 'Timezone and weekly hours available', style: 'short', max: 200 },
        { id: 'staff_exp', label: 'Prior staff / moderation experience', style: 'paragraph', max: 1200 },
        { id: 'why', label: 'Why do you want to be staff here?', style: 'paragraph', max: 1200 },
        { id: 'strength', label: 'What do you bring that we don’t have?', style: 'paragraph', max: 800 },
      ],
      [
        { id: 'scenario_friend', label: 'Scenario: a friend breaks a rule', style: 'paragraph', max: 1200 },
        { id: 'scenario_heat', label: 'Scenario: a player screams at you in a ticket', style: 'paragraph', max: 1200 },
        { id: 'tools', label: 'Experience with txAdmin / FiveM tooling?', style: 'paragraph', max: 800 },
      ],
    ],
  },
  {
    key: 'creator',
    label: 'Content Creator',
    emoji: '🎬',
    description: 'Stream or make videos in Gatewood? Apply for the creator role.',
    grants: 'creator',
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin'],
    color: 0xEC4899,
    pages: [
      [
        { id: 'platform', label: 'Platform (Twitch / YouTube / TikTok / Kick)', style: 'short', max: 60 },
        { id: 'channel', label: 'Channel URL', style: 'short', max: 200 },
        { id: 'size', label: 'Average viewers / subscribers', style: 'short', max: 100 },
        { id: 'schedule', label: 'Streaming / upload schedule', style: 'short', max: 200 },
        { id: 'why', label: 'What will you make for Gatewood?', style: 'paragraph', max: 1000 },
      ],
    ],
  },
  {
    key: 'gang',
    label: 'Gang / MC Registration',
    emoji: '💀',
    description: 'Register a criminal organisation or motorcycle club.',
    grants: 'gangleader',
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin'],
    color: 0x111827,
    pages: [
      [
        { id: 'org_name', label: 'Organisation name', style: 'short', max: 80 },
        { id: 'org_type', label: 'Type (Gang / MC / Cartel / Crew)', style: 'short', max: 40 },
        { id: 'members', label: 'Founding members (Discord names)', style: 'paragraph', max: 800 },
        { id: 'concept', label: 'Concept and backstory', style: 'paragraph', max: 1500 },
        { id: 'activity', label: 'What kind of RP will you drive?', style: 'paragraph', max: 1000 },
      ],
    ],
  },
  {
    key: 'business',
    label: 'Business Registration',
    emoji: '💼',
    description: 'Open a legal business in Gatewood.',
    grants: 'bizowner',
    reviewKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin'],
    color: 0x059669,
    pages: [
      [
        { id: 'org_name', label: 'Business name', style: 'short', max: 80 },
        { id: 'org_type', label: 'Industry (bar, garage, dealership…)', style: 'short', max: 60 },
        { id: 'location', label: 'Desired location in the city', style: 'short', max: 200 },
        { id: 'concept', label: 'Business plan', style: 'paragraph', max: 1500 },
        { id: 'staffing', label: 'Who will run it day to day?', style: 'paragraph', max: 800 },
      ],
    ],
  },
];

const byKey = (key) => APPLICATIONS.find((a) => a.key === key) || null;

module.exports = { APPLICATIONS, byKey };
