-- Migration number: 0004
-- Jasper does a poo before bed each night — add it to the daily routine,
-- slotted just before Bed. The database is live with real ticks:
-- completions reference activity ids, so unlike 0002 this must NOT
-- delete/reinsert the routine — shift sort orders and insert one row.
-- If Bed has been renamed/removed via the admin portal, fall back to
-- appending at the end of the list.
UPDATE default_activities
   SET sort_order = sort_order + 1
 WHERE sort_order >= COALESCE(
   (SELECT sort_order FROM default_activities WHERE title = '🛏️ Bed'),
   (SELECT MAX(sort_order) + 1 FROM default_activities));

INSERT INTO default_activities (title, sort_order)
VALUES ('💩 Poo', COALESCE(
  (SELECT sort_order - 1 FROM default_activities WHERE title = '🛏️ Bed'),
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM default_activities)));
