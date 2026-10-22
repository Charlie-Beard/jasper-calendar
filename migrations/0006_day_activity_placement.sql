-- Migration number: 0006
-- Let a day's special activities sit inside the routine instead of after
-- Bed: after_default is the id of the default_activities row (in that
-- date's calendar) the activity comes straight after. NULL = end of the day
-- (how every existing activity behaves today). Additive only.
ALTER TABLE day_activities ADD COLUMN after_default INTEGER;
