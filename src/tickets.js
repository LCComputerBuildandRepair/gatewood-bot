'use strict';
/**
 * Ticket type definitions.
 *
 * Each type opens a private channel under its own category (created by
 * /build-tickets, falling back to the support category) and is visible to the
 * opener plus the listed staff keys. `questions` are asked in a modal before
 * the channel is created, so staff open a ticket that already has the facts.
 */

const TICKET_TYPES = [
  {
    key: 'support',
    label: 'General Support',
    emoji: '🎫',
    description: 'Questions, connection problems, anything else.',
    prefix: 'support',
    categoryName: '🎫 ┃ SUPPORT TICKETS',
    staffKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin', 'srmod', 'mod', 'trialmod', 'support'],
    color: 0x2B6CB0,
    questions: [
      { id: 'subject', label: 'What do you need help with?', style: 'short', max: 200 },
      { id: 'details', label: 'Details', style: 'paragraph', max: 1500 },
    ],
  },
  {
    key: 'report',
    label: 'Report a Player',
    emoji: '🚩',
    description: 'RDM, VDM, metagaming, breaking character — report it here.',
    prefix: 'report',
    categoryName: '🚩 ┃ PLAYER REPORTS',
    staffKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin', 'srmod', 'mod', 'trialmod'],
    color: 0xEF4444,
    questions: [
      { id: 'accused', label: 'Who are you reporting? (name / ID)', style: 'short', max: 200 },
      { id: 'rule', label: 'Which rule was broken?', style: 'short', max: 200 },
      { id: 'when', label: 'When did it happen?', style: 'short', max: 100, placeholder: 'e.g. today around 8pm EST' },
      { id: 'details', label: 'What happened?', style: 'paragraph', max: 1500 },
      { id: 'evidence', label: 'Evidence link (clip / screenshot)', style: 'short', max: 400, required: false },
    ],
  },
  {
    key: 'staffreport',
    label: 'Report a Staff Member',
    emoji: '🛡️',
    description: 'Goes only to senior leadership. Nobody else can see it.',
    prefix: 'staff-report',
    categoryName: '🔒 ┃ STAFF REPORTS',
    staffKeys: ['owner', 'coowner', 'management', 'headadmin'],
    color: 0x7C3AED,
    questions: [
      { id: 'accused', label: 'Which staff member?', style: 'short', max: 200 },
      { id: 'details', label: 'What happened?', style: 'paragraph', max: 1500 },
      { id: 'evidence', label: 'Evidence link', style: 'short', max: 400, required: false },
    ],
  },
  {
    key: 'appeal',
    label: 'Ban Appeal',
    emoji: '⚖️',
    description: 'Appeal a ban or a kick.',
    prefix: 'appeal',
    categoryName: '⚖️ ┃ BAN APPEALS',
    staffKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin'],
    color: 0xF59E0B,
    questions: [
      { id: 'ingame', label: 'Your in-game name / Steam or CFX ID', style: 'short', max: 200 },
      { id: 'banned_by', label: 'Who banned you, and when?', style: 'short', max: 200 },
      { id: 'reason', label: 'What were you banned for?', style: 'paragraph', max: 800 },
      { id: 'why', label: 'Why should the ban be lifted?', style: 'paragraph', max: 1500 },
    ],
  },
  {
    key: 'bug',
    label: 'Bug Report',
    emoji: '🐛',
    description: 'Something in the city is broken.',
    prefix: 'bug',
    categoryName: '🐛 ┃ BUG REPORTS',
    staffKeys: ['owner', 'coowner', 'management', 'developer', 'headadmin', 'admin'],
    color: 0x16A34A,
    questions: [
      { id: 'what', label: 'What is broken?', style: 'short', max: 200 },
      { id: 'repro', label: 'How do we reproduce it?', style: 'paragraph', max: 1500 },
      { id: 'evidence', label: 'Screenshot / clip link', style: 'short', max: 400, required: false },
    ],
  },
  {
    key: 'donation',
    label: 'Donation & Store',
    emoji: '💎',
    description: 'Purchases, missing perks, priority queue.',
    prefix: 'donation',
    categoryName: '💎 ┃ DONATIONS',
    staffKeys: ['owner', 'coowner', 'management', 'headadmin', 'admin'],
    color: 0xD4AF37,
    questions: [
      { id: 'subject', label: 'What is this about?', style: 'short', max: 200 },
      { id: 'details', label: 'Details (order id, date, amount…)', style: 'paragraph', max: 1500 },
    ],
  },
  {
    key: 'partner',
    label: 'Partnership Request',
    emoji: '🤝',
    description: 'Other communities and creators — pitch us here.',
    prefix: 'partner',
    categoryName: '🤝 ┃ PARTNERSHIPS',
    staffKeys: ['owner', 'coowner', 'management', 'headadmin'],
    color: 0xA78BFA,
    questions: [
      { id: 'community', label: 'Community / channel name', style: 'short', max: 200 },
      { id: 'size', label: 'Your member or viewer count', style: 'short', max: 100 },
      { id: 'offer', label: 'What are you proposing?', style: 'paragraph', max: 1500 },
    ],
  },
];

const byKey = (key) => TICKET_TYPES.find((t) => t.key === key) || null;

module.exports = { TICKET_TYPES, byKey };
