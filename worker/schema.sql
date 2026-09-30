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
