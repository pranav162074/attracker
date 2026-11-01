-- Up Migration

ALTER TABLE timetables ADD COLUMN tracking_started_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE timetables DROP COLUMN tracking_started_at;
