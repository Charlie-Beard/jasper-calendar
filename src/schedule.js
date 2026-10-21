// The family schedule. Edit this file (no service-worker cache bump needed —
// it's served by the Worker inside /api/calendar, which is always network-first).
// Dates are 'YYYY-MM-DD'.

// There is one calendar per school holiday (see CALENDARS at the bottom).
// Their date ranges must not overlap: a date alone decides which calendar —
// and so which daily routine — it belongs to.

// The summer calendar's first and last day (inclusive).
export const HOLIDAY_START = '2026-07-23';
export const HOLIDAY_END = '2026-09-01';

export const SCHEDULE = {
  // Family trips: tiles in these ranges get the green "away" look.
  trips: [
    { from: '2026-08-21', to: '2026-08-28', label: 'Wales', emoji: '🐉' },
  ],

  // Days Grandma and Grandpa take Jasper — add dates here as they get booked.
  grandparentDays: ['2026-07-24', '2026-08-01', '2026-08-06', '2026-08-14', '2026-08-20'],

  // Days at Oma's (grandma's house) — add dates here as they get booked.
  // Oma is with us for the whole Wales trip (21–28 Aug).
  omaDays: [
    '2026-07-23', '2026-07-27', '2026-08-04',
    '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24',
    '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
  ],

  // Days out at The Living Rainforest.
  rainforestDays: ['2026-07-30'],

  // Days out at the Discovery Centre.
  discoveryDays: ['2026-08-05'],

  // Days out at Beale Park.
  bealeParkDays: ['2026-07-29', '2026-08-03'],

  // Swimming pool days.
  swimmingDays: ['2026-07-23'],

  // Days other families come over to our house.
  friendsDays: ['2026-08-15'],

  // Days Dad is off work, on top of every weekend.
  dadOffExtra: [
    '2026-07-28', '2026-07-31', '2026-08-06', '2026-08-07',
    '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-17',
  ],

  // Weekend days that should NOT count as Dad-off days.
  dadOffSkip: ['2026-08-22', '2026-08-23'],

  // Tuesdays the cleaners are NOT here (holiday weeks).
  cleanerSkip: ['2026-08-25'],

  // The day after the holidays — no tasks, just the big moment.
  schoolDay: '2026-09-02',
};

// October half term — the spooky Halloween calendar at /halloween.
export const HALF_TERM_START = '2026-10-23';
export const HALF_TERM_END = '2026-11-01';

export const HALF_TERM_SCHEDULE = {
  // Halloween night itself.
  halloweenDays: ['2026-10-31'],

  // Swimming pool days (29 Oct: in the morning, before lunch).
  swimmingDays: ['2026-10-29'],

  // Same rule-based fields as the summer (dad off at weekends, cleaners on
  // Tuesdays) — list any half-term exceptions here.
  dadOffExtra: ['2026-10-29', '2026-10-30'],
  dadOffSkip: [],
  cleanerSkip: [],

  // The day after half term — no tasks, just the big moment.
  schoolDay: '2026-11-02',
};

// Every calendar the app serves, keyed by id. The id is used in the API
// (/api/calendar/<id>, /api/admin/<id>/defaults) and in the
// default_activities.calendar column, which holds each calendar's routine.
export const CALENDARS = {
  summer: { from: HOLIDAY_START, to: HOLIDAY_END, schedule: SCHEDULE },
  halfterm: { from: HALF_TERM_START, to: HALF_TERM_END, schedule: HALF_TERM_SCHEDULE },
};
