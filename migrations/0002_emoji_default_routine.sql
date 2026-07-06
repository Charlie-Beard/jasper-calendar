-- Migration number: 0002
-- Replace the default routine with Jasper's list, one emoji per activity
-- (he's 6 and reads the pictures, not the words).
DELETE FROM completions WHERE activity_type = 'default';
DELETE FROM default_activities;

INSERT INTO default_activities (title, sort_order) VALUES
  ('⏰ Wake Up', 1),
  ('🚶 Go Downstairs', 2),
  ('🥣 Breakfast', 3),
  ('🧴 Sun Cream', 4),
  ('🪥 Brush Teeth', 5),
  ('👕 Get Changed', 6),
  ('🥪 Lunch', 7),
  ('🍝 Dinner', 8),
  ('🛁 Bath', 9),
  ('🛏️ Bed', 10);
