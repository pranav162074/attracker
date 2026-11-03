-- Up Migration

CREATE TABLE password_resets (
  user_id     BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  code_hash   BYTEA NOT NULL CHECK (octet_length(code_hash) = 32),
  attempts    INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_resets_expires_at_idx ON password_resets (expires_at);

-- Down Migration

DROP TABLE password_resets;
