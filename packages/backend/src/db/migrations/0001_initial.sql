CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_url_hash ON reports (url, content_hash);
CREATE INDEX IF NOT EXISTS idx_reports_expires ON reports (expires_at);

CREATE TABLE IF NOT EXISTS history (
  uuid TEXT NOT NULL,
  report_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uuid, report_id),
  FOREIGN KEY (report_id) REFERENCES reports(id)
);

CREATE INDEX IF NOT EXISTS idx_history_uuid_created ON history (uuid, created_at DESC);
