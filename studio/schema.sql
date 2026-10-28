CREATE TABLE IF NOT EXISTS docs (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS docs_status ON docs (collection, status);
CREATE TABLE IF NOT EXISTS log (
  at INTEGER NOT NULL,
  who TEXT,
  action TEXT NOT NULL,
  collection TEXT,
  doc_id TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS log_at ON log (at);
