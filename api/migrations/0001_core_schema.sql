-- Up Migration

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          TEXT NOT NULL CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254 AND email LIKE '%_@_%'),
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  user_agent    TEXT CHECK (char_length(user_agent) <= 300),
  CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE timetables (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name                TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  starts_on           DATE NOT NULL,
  ends_on             DATE,
  time_zone           TEXT NOT NULL DEFAULT 'Asia/Kolkata' CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  required_bp         INTEGER CHECK (required_bp BETWEEN 1 AND 10000),
  condonation_bp      INTEGER CHECK (condonation_bp BETWEEN 1 AND 10000),
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (condonation_bp IS NULL OR (required_bp IS NOT NULL AND condonation_bp < required_bp))
);

CREATE INDEX timetables_user_id_idx ON timetables (user_id);
CREATE UNIQUE INDEX timetables_user_name_key ON timetables (user_id, lower(btrim(name))) WHERE archived_at IS NULL;

CREATE TABLE subjects (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id       BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  name               TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  short_name         TEXT CHECK (char_length(btrim(short_name)) BETWEEN 1 AND 12),
  kind               TEXT NOT NULL DEFAULT 'theory' CHECK (kind IN ('theory', 'lab', 'other')),
  counts_attendance  BOOLEAN NOT NULL DEFAULT true,
  count_per_session  BOOLEAN NOT NULL DEFAULT false,
  colour             TEXT CHECK (colour ~ '^#[0-9a-f]{6}$'),
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (timetable_id, id)
);

CREATE UNIQUE INDEX subjects_timetable_name_key ON subjects (timetable_id, lower(btrim(name))) WHERE archived_at IS NULL;

CREATE TABLE grid_versions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id    BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  effective_from  DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (timetable_id, effective_from),
  UNIQUE (timetable_id, id)
);

CREATE TABLE grid_slots (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id  BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  version_id    BIGINT NOT NULL,
  subject_id    BIGINT NOT NULL,
  weekday       SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute  SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute    SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  periods       SMALLINT NOT NULL DEFAULT 1 CHECK (periods BETWEEN 1 AND 12),
  CHECK (end_minute > start_minute),
  FOREIGN KEY (timetable_id, version_id) REFERENCES grid_versions (timetable_id, id) ON DELETE CASCADE,
  FOREIGN KEY (timetable_id, subject_id) REFERENCES subjects (timetable_id, id),
  UNIQUE (timetable_id, id),
  EXCLUDE USING gist (version_id WITH =, weekday WITH =, int4range(start_minute, end_minute) WITH &&)
);

CREATE INDEX grid_slots_subject_id_idx ON grid_slots (subject_id);

CREATE TABLE calendar_days (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id     BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  starts_on        DATE NOT NULL,
  ends_on          DATE NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('holiday', 'follows_weekday', 'no_classes_before', 'no_classes_after')),
  follows_weekday  SMALLINT CHECK (follows_weekday BETWEEN 1 AND 7),
  cutoff_minute    SMALLINT CHECK (cutoff_minute BETWEEN 0 AND 1440),
  label            TEXT CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK ((kind = 'follows_weekday') = (follows_weekday IS NOT NULL)),
  CHECK ((kind IN ('no_classes_before', 'no_classes_after')) = (cutoff_minute IS NOT NULL)),
  CHECK (kind = 'holiday' OR ends_on = starts_on),
  EXCLUDE USING gist (timetable_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
);

CREATE TABLE class_marks (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id         BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  slot_id              BIGINT NOT NULL,
  on_date              DATE NOT NULL,
  attendance           TEXT NOT NULL CHECK (attendance IN ('present', 'absent', 'cancelled')),
  substitute_subject_id  BIGINT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (timetable_id, slot_id) REFERENCES grid_slots (timetable_id, id),
  FOREIGN KEY (timetable_id, substitute_subject_id) REFERENCES subjects (timetable_id, id),
  UNIQUE (slot_id, on_date),
  CHECK (attendance <> 'present' OR substitute_subject_id IS NOT NULL),
  CHECK (attendance <> 'cancelled' OR substitute_subject_id IS NULL)
);

CREATE INDEX class_marks_timetable_date_idx ON class_marks (timetable_id, on_date);

CREATE TABLE extra_classes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id  BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  subject_id    BIGINT NOT NULL,
  on_date       DATE NOT NULL,
  start_minute  SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute    SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  periods       SMALLINT NOT NULL DEFAULT 1 CHECK (periods BETWEEN 1 AND 12),
  attendance    TEXT NOT NULL DEFAULT 'present' CHECK (attendance IN ('present', 'absent')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute),
  FOREIGN KEY (timetable_id, subject_id) REFERENCES subjects (timetable_id, id)
);

CREATE INDEX extra_classes_timetable_date_idx ON extra_classes (timetable_id, on_date);
CREATE INDEX extra_classes_subject_id_idx ON extra_classes (subject_id);

CREATE TABLE checkpoints (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id   BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  as_of          DATE NOT NULL,
  free_held      INTEGER NOT NULL DEFAULT 0 CHECK (free_held >= 0),
  free_attended  INTEGER NOT NULL DEFAULT 0 CHECK (free_attended >= 0),
  source         TEXT NOT NULL CHECK (source IN ('manual', 'sheet')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (free_attended <= free_held),
  UNIQUE (timetable_id, as_of),
  UNIQUE (timetable_id, id)
);

CREATE TABLE checkpoint_subjects (
  timetable_id   BIGINT NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  checkpoint_id  BIGINT NOT NULL,
  subject_id     BIGINT NOT NULL,
  held           INTEGER NOT NULL CHECK (held >= 0),
  attended       INTEGER NOT NULL CHECK (attended >= 0),
  PRIMARY KEY (checkpoint_id, subject_id),
  CHECK (attended <= held),
  FOREIGN KEY (timetable_id, checkpoint_id) REFERENCES checkpoints (timetable_id, id) ON DELETE CASCADE,
  FOREIGN KEY (timetable_id, subject_id) REFERENCES subjects (timetable_id, id)
);

CREATE INDEX checkpoint_subjects_subject_id_idx ON checkpoint_subjects (subject_id);

-- Down Migration

DROP TABLE checkpoint_subjects;
DROP TABLE checkpoints;
DROP TABLE extra_classes;
DROP TABLE class_marks;
DROP TABLE calendar_days;
DROP TABLE grid_slots;
DROP TABLE grid_versions;
DROP TABLE subjects;
DROP TABLE timetables;
DROP TABLE sessions;
DROP TABLE users;
