export const schema = [
  `CREATE TABLE IF NOT EXISTS waitlist_signups (
    id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)),
    city text NOT NULL DEFAULT '', language text NOT NULL CHECK (language IN ('en','fr','el','es','it','de','ru')),
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
// Additive, repeatable migration: the original app list remains compatible with v1.
schema.push(
  `ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn'))`,
  `ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS visit_signups (LIKE waitlist_signups INCLUDING ALL)`,
  `ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'app' CHECK (audience IN ('app','visits','both'))`,
  `ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
  `ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`,
  `ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS resolution text NOT NULL DEFAULT ''`,
  `ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS resolution_note text NOT NULL DEFAULT ''`,
  `ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS resolved_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS privacy_actions (
    id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
    action text NOT NULL, note text NOT NULL DEFAULT '', owner_verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
 );
schema.push(
`DO $$ DECLARE tab text; c record; BEGIN FOREACH tab IN ARRAY ARRAY['waitlist_signups','visit_signups'] LOOP
FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=tab::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%language%' LOOP EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',tab,c.conname); END LOOP;
EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK(language IN (''en'',''fr'',''el'',''es'',''it'',''de'',''ru''))',tab,tab||'_language_check'); END LOOP; END $$`
);
