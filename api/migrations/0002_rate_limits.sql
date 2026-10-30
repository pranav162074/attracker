-- Up Migration

CREATE TABLE rate_limit_windows (
  bucket        TEXT NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 40),
  key           TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 300),
  window_start  TIMESTAMPTZ NOT NULL,
  hits          INTEGER NOT NULL CHECK (hits > 0),
  PRIMARY KEY (bucket, key, window_start)
);

CREATE INDEX rate_limit_windows_window_start_idx ON rate_limit_windows (window_start);

-- Down Migration

DROP TABLE rate_limit_windows;
