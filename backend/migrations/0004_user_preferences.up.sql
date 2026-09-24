-- Per-user UI preferences (e.g. column layout: visibility, order, widths),
-- stored server-side so a user's configured table view persists across
-- browsers and devices, not just in one browser's localStorage.
CREATE TABLE IF NOT EXISTS user_preferences (
    login      TEXT PRIMARY KEY REFERENCES users(login) ON DELETE CASCADE,
    prefs      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
