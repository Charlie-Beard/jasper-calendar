-- Migration number: 0005
-- A second calendar for October half term (/halloween). Each calendar has its
-- own daily routine, so default_activities gains a `calendar` column (ids from
-- src/schedule.js CALENDARS); every existing row is the summer routine.
-- The half-term routine starts as a copy of the summer one minus sun cream
-- (it's October) — parents can edit it in the admin portal.
-- Additive only: existing ids, and so existing ticks, are untouched.
ALTER TABLE default_activities ADD COLUMN calendar TEXT NOT NULL DEFAULT 'summer';

INSERT INTO default_activities (title, sort_order, calendar)
SELECT title, ROW_NUMBER() OVER (ORDER BY sort_order), 'halfterm'
  FROM default_activities
 WHERE calendar = 'summer' AND title <> '🧴 Sun Cream';
