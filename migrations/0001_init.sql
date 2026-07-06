-- Migration number: 0001
CREATE TABLE default_activities (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE day_activities (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE INDEX idx_day_activities_date ON day_activities(date);

CREATE TABLE completions (
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  activity_type TEXT NOT NULL CHECK (activity_type IN ('default', 'day')),
  activity_id INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (date, activity_type, activity_id)
);

INSERT INTO default_activities (title, sort_order) VALUES
  ('Wake up', 1),
  ('Brush teeth', 2),
  ('Get dressed', 3),
  ('Breakfast', 4),
  ('Morning activity', 5),
  ('Lunch', 6),
  ('Afternoon activity', 7),
  ('Dinner', 8),
  ('Bath', 9),
  ('Story', 10),
  ('Bed', 11);
