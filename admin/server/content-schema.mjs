export const contentSchema=[
`CREATE TABLE IF NOT EXISTS cms_budgets(day date NOT NULL,kind text NOT NULL,used integer NOT NULL,PRIMARY KEY(day,kind))`,
`CREATE TABLE IF NOT EXISTS cms_documents(id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS cms_revisions(id bigserial PRIMARY KEY, document_id text NOT NULL, version integer NOT NULL, document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,version))`,
`CREATE TABLE IF NOT EXISTS cms_jobs(id uuid PRIMARY KEY, document_id text NOT NULL, language text NOT NULL, source_hash text NOT NULL, status text NOT NULL DEFAULT 'running', error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz)`,
`CREATE UNIQUE INDEX IF NOT EXISTS cms_job_running ON cms_jobs(document_id,language) WHERE status IN ('queued','running')`,
`CREATE TABLE IF NOT EXISTS cms_releases(id uuid PRIMARY KEY, snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), live_at timestamptz, error text)`,
`CREATE UNIQUE INDEX IF NOT EXISTS cms_one_pending ON cms_releases(status) WHERE status='pending'`,
`CREATE TABLE IF NOT EXISTS cms_connections(name text PRIMARY KEY, secret text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS cms_reports(id bigserial PRIMARY KEY, kind text NOT NULL, page_id text NOT NULL, language text NOT NULL, report jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
];
