// The family schedule. Edit this file (no service-worker cache bump needed —
// it's served by the Worker inside /api/calendar, which is always network-first).
// Dates are 'YYYY-MM-DD'.

// The calendar's first and last day (inclusive).
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
  omaDays: ['2026-08-04'],

  // Days out at The Living Rainforest.
  rainforestDays: ['2026-07-27'],

  // Days out at Beale Park.
  bealeParkDays: ['2026-07-29'],

  // Days Dad is off work, on top of every weekend.
  dadOffExtra: ['2026-07-28', '2026-08-11', '2026-08-17'],

  // Tuesdays the cleaners are NOT here (holiday weeks).
  cleanerSkip: ['2026-08-25'],

  // The day after the holidays — no tasks, just the big moment.
  schoolDay: '2026-09-02',
};
