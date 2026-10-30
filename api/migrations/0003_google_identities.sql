-- Up Migration

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE user_identities (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('google')),
  subject     TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  email       TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, subject),
  UNIQUE (user_id, provider)
);

-- Down Migration

DROP TABLE user_identities;
UPDATE users SET password_hash = 'disabled' WHERE password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
