CREATE TABLE IF NOT EXISTS player_sessions (
  token_hash text PRIMARY KEY NOT NULL,
  player_id text NOT NULL UNIQUE,
  expires_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_player_sessions_expiry ON player_sessions (expires_at);
