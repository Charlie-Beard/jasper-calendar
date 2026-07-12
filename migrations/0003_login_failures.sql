-- Migration number: 0003
-- Failed admin sign-in attempts, for rate limiting (see handleLogin in worker.js).
-- Rows expire naturally: the login handler deletes anything older than the window.
CREATE TABLE login_failures (
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL -- ISO timestamp
);
CREATE INDEX idx_login_failures_ip ON login_failures(ip);
