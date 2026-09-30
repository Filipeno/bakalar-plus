-- Shared class calendars. class_key = hash(school address | class id); author_hash = hash(secret | school | user id).
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  class_key TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  author_hash TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS entries_class_date ON entries (class_key, date);
CREATE INDEX IF NOT EXISTS entries_author ON entries (author_hash, created);
CREATE TABLE IF NOT EXISTS reports (
  entry_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (entry_id, user_hash)
);

-- Web Push (web/iPhone version). id = same user key as the calendar's author_hash.
CREATE TABLE IF NOT EXISTS push_users (
  id TEXT PRIMARY KEY,
  school TEXT NOT NULL,
  enc_refresh TEXT NOT NULL,          -- AES-GCM with the TOKEN_KEY secret; never the password
  status TEXT NOT NULL,               -- 'active' | 'relogin' (the school refused the refresh token)
  prefs TEXT NOT NULL,                -- {"grades":true,"changes":true}
  lang TEXT NOT NULL DEFAULT 'cs',
  last_check INTEGER NOT NULL DEFAULT 0,
  fails INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_users_due ON push_users (status, last_check);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);
CREATE TABLE IF NOT EXISTS push_state (
  user_id TEXT PRIMARY KEY,
  marks TEXT,                         -- JSON list of "markId:mark" seen last time
  changes TEXT,                       -- JSON list of timetable-change signatures seen last time
  updated INTEGER NOT NULL
);
