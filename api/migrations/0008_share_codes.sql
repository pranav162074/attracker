-- Up Migration

CREATE TABLE share_codes (
  code          TEXT PRIMARY KEY CHECK (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  timetable_id  BIGINT NOT NULL UNIQUE REFERENCES timetables (id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE share_codes;
