CREATE TABLE profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profile_singleton CHECK (id = 1)
);

INSERT INTO profile (id, notes) VALUES (1, '');
