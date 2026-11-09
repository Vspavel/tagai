export const schema = [
  `CREATE TABLE IF NOT EXISTS waitlist_signups (
    id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)),
    city text NOT NULL DEFAULT '', language text NOT NULL CHECK (language IN ('en','fr','el')),
    consent_version text NOT NULL, consent_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '12 months',
    email_verified boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT '', campaign text NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS privacy_requests (
    id uuid PRIMARY KEY, email text NOT NULL, language text NOT NULL,
    request_type text NOT NULL CHECK (request_type IN ('withdraw','access','correct','delete','other')),
    message text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '12 months'
  )`,
  `CREATE TABLE IF NOT EXISTS request_limits (
    bucket text PRIMARY KEY, hits integer NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS waitlist_expiry_idx ON waitlist_signups(expires_at)`,
  `CREATE INDEX IF NOT EXISTS privacy_pending_idx ON privacy_requests(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS request_limits_expiry_idx ON request_limits(expires_at)`
];
