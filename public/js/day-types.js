// The day-type registry: the one place that defines what kinds of day exist,
// how a date matches each, and how each one shows up (tile class, badge
// emoji, modal note). calendar.js derives the tiles and the modal notes
// entirely from this list.
//
// To add a day type, see CLAUDE.md → "Adding a new day type". In short:
//   1. Add its dates to SCHEDULE in src/schedule.js.
//   2. Add one entry to DAY_TYPES below, in priority order.
//   3. Add CSS in style.css: a `.tile.<key>` gradient and a `.<key>-note` colour.
//
// Semantics:
// - Entries are in priority order. The FIRST matching non-additive entry is
//   the day's headline: it colours the tile and provides the modal note, and
//   any later non-additive entries are suppressed (so a grandparent day hides
//   the dad-off indicator).
// - `additive: true` entries (the cleaner) match independently: their class,
//   badge and note appear alongside whatever else the day has.
// - Trips (the date ranges in SCHEDULE.trips) are handled separately in
//   calendar.js: a trip outranks every note here but does NOT suppress the
//   headline type's tile class (the tile blends, e.g. `.tile.trip.dad`).
// - `dates: '<key>'` matches the dates listed in SCHEDULE.<key>; use
//   `match(schedule, date, dow)` for rule-based types (dow: 0=Sun … 6=Sat).
//   Treat schedule fields as possibly missing (an old cached /api/calendar
//   response may predate a newly added type) — hence the `|| []` guards.
// - Badges fill two slots, top-left then top-right, in registry order, so
//   two badges can never overlap. `side: 'right'` pins a badge to the
//   right-hand slot (the dad badge, by convention: primary indicators left,
//   secondary right).

export const DAY_TYPES = [
  {
    key: 'gran',
    emoji: '👵👴',
    note: "You're with Grandma and Grandpa today!",
    dates: 'grandparentDays',
  },
  {
    key: 'oma',
    emoji: '👩',
    note: "You're at Oma's today!",
    dates: 'omaDays',
  },
  {
    key: 'rainforest',
    emoji: '🦜',
    note: "You're off to the Living Rainforest today!",
    dates: 'rainforestDays',
  },
  {
    key: 'dad',
    emoji: '👨',
    side: 'right',
    note: "Daddy's off work today!",
    match: (s, date, dow) => dow === 0 || dow === 6 || (s.dadOffExtra || []).includes(date),
  },
  {
    key: 'cleaner',
    emoji: '🧹',
    additive: true,
    note: 'The cleaners are coming today!',
    match: (s, date, dow) => dow === 2 && !(s.cleanerSkip || []).includes(date),
  },
];

// All types that apply to a date: the first matching non-additive entry
// (the headline) plus every matching additive entry, in registry order.
export function matchDayTypes(schedule, date, dow) {
  const matched = [];
  let headlineTaken = false;
  for (const type of DAY_TYPES) {
    const hit = type.dates
      ? (schedule[type.dates] || []).includes(date)
      : type.match(schedule, date, dow);
    if (!hit) continue;
    if (type.additive) {
      matched.push(type);
    } else if (!headlineTaken) {
      matched.push(type);
      headlineTaken = true;
    }
  }
  return matched;
}
