# TAGAI — tagai.art

Production landing page in English, French and Greek, with a first-party waitlist API and PostgreSQL storage. Includes a separate protected admin project and optional consent-based GA4. Subscriber data stays in PostgreSQL; no mailing-list SaaS is used.

## Development

Node 24 is required.

```sh
npm ci
npm test
npm run build
npm run dev
```

The development server on port 4174 uses an ephemeral PostgreSQL-compatible PGlite database. Restarting it clears test data. Automated tests execute the actual schema and signup SQL, including deduplication, concurrent rate limits and retention.

## Production

- GitHub: `Vspavel/tagai`, production branch `main`.
- Vercel: project `tagai`, team `vspa`, Node 24, Frankfurt functions.
- Neon: `tagai-waitlist`, Frankfurt. Database secrets are supplied by the Vercel integration.
- Required sensitive variables: `DATABASE_URL`, `FORM_SECRET` (at least 32 random characters), `CRON_SECRET`.
- Build: `npm test && npm run build`. It applies additive, idempotent schema creation before generating the static site. A production build fails if the database is unavailable. Preview builds skip migrations and all APIs fail closed; use the ephemeral development database for functional QA.
- Push a feature branch, review its preview and CI results, then merge into `main` for production. This workflow requires the GitHub App to have access to this repository and the Vercel Git connection to be active.
- Vercel preview authentication remains enabled. The custom production domain is public.
- The daily authenticated `/api/cleanup` cron removes expired data. Do not remove `CRON_SECRET`.

## Waitlist operation

Open Vercel → Storage → `tagai-waitlist` → Open in Neon → Tables. `waitlist_signups` holds app early-access signups; `visit_signups` holds studio-visit signups independently. Each table contains the email, optional city, language, signup/consent timestamps and consent version. A unique normalized email prevents duplicate rows and prevents a new request from overwriting an existing choice.

These are **unverified email registrations**, not application accounts. No password is collected, and this version does not send automatic emails. Confirm address ownership before sharing private information or granting account access. Set up an authenticated sender and an unsubscribe mechanism before sending launch invitations at scale.

Review `privacy_requests` regularly. Verify ownership through a private reply before disclosing or editing records; then perform the requested action and mark the request resolved. The public form records a request for review; it does not claim that deletion has already occurred. Waitlist records expire after 12 months. Network addresses are never stored directly; rotating keyed rate-limit hashes expire after 2 hours and the daily cleanup removes them within 48 hours.

The API has same-origin checks, request-size limits, input validation, signed address-bound form challenges, honeypots and a shared database limit of 20 submissions per network per hour. This is basic abuse protection, not a CAPTCHA or verified-email service. Monitor usage and tighten limits if attacks occur.

## Source and assets

English content and six translations are edited in the protected admin at `/content.html`. Versioned CMS records produce immutable approved releases. `admin/server/content-seed.json` preserves the original EN/FR/EL baseline until the first CMS publication. `build.mjs` renders only release snapshots, never drafts. New pages use the article template. See [content operations](CONTENT-OPERATIONS.md) for activation, provider limits, publication and rollback. Legacy `src/locales.mjs`, `src/forms.mjs` and `src/flow.mjs` are retained for reference; they are no longer the build source.

Photographs and TAGAI marks were supplied by the project owner for this website. They are not licensed for general reuse. Inter and Roboto Condensed are locally hosted under the included OFL licenses; no trial fonts are deployed.

Only the landing page and waitlist are operational. Product descriptions refer to the planned March 2027 early access. Do not label studio participants or VIMA as confirmed commercial partners without an explicit agreement.

## Private admin (v1.2)

The `admin/` directory is a separate Vercel project, `tagai-admin`, with root directory `admin`. **Vercel Authentication → All Deployments is mandatory**, including production domains. Do not add bypass links, public aliases or protection exceptions. Project users with deployment access can read the panel. The application uses the existing team's Vercel identity rather than storing passwords.

Set `ADMIN_PROJECT_ID` to the admin project's exact ID for Production and Preview. Set `ADMIN_ENABLED=1` and connect the existing waitlist database in **Production only**. The data API fails closed on the public project, on previews, or without database configuration. Preview builds can show the UI but cannot read subscriber data. The privacy API supports taking a request into work, scoped withdrawal, and scoped deletion after manual address-ownership verification. It checks Origin, an HttpOnly same-site CSRF cookie/token, the request version and an idempotency key; actions are logged atomically. Access/correction/other requests can be marked completed only after handling outside the panel. The panel does not send invitations or verification emails. All responses are private/no-store; no tracking is installed in the admin app.

The panel offers email search, city/language/date filters, 50-row pagination, statistics, pending privacy requests and filtered CSV export (10,000-row limit). Date filters and charts use Asia/Nicosia. Internal QA registrations are excluded unless explicitly selected. CSV cells are escaped against spreadsheet formulas. Counts reflect database registrations; they do not imply verified email ownership.

## Google Analytics 4

Set `GA4_MEASUREMENT_ID=G-...` in the **public site's Production build environment** and redeploy. Set `GA4_PROPERTY_ID` in the **admin project's Production environment** to link to the correct GA4 reports. Without the measurement ID, analytics and its consent banner remain inactive; no ID is fabricated. Preview deployments never load Google Analytics.

Tracking only starts after explicit analytics consent (basic consent mode). Reject and accept have equal prominence. Consent can be withdrawn from Cookie settings and expires after 180 days. Ads storage, user data, personalization and Google Signals are disabled. The tag never receives email or form contents; page and referrer query strings are removed. UTM source, medium and campaign are restricted to short machine-readable labels. Do not put personal information in campaign names.

Measurement v2 distinguishes CTA clicks, form starts, new database records, first email confirmations and reactivations. Mark `app_waitlist_confirmed` as the GA4 key event, once per event and without monetary value. `waitlist_submit_success` now means a newly inserted app email row; duplicates do not emit it. Keep automatic form submissions out of conversion counts. The goal of 1,000 uses verified, active, unexpired app records in PostgreSQL, independently of dashboard filters and other lists. GA4 is a consented funnel and can undercount when delivery is blocked; it is not the membership ledger. See [measurement v2](docs/analytics-measurement-v2.md) for attribution, event definitions, validation and the email-provider gate.

Validate consent rejection, acceptance, withdrawal, successful and failed submissions in GA4 DebugView/Realtime before calling the Google integration complete. Analytics account setup and data collection cannot be verified without a real GA4 property.

## Phase-one design changes (9 November 2026)

- Main signup is for app early access. Studio visits have a separate page, form, consent version, table and admin filter. Existing records stay in the app list.
- The three generated `demo-artwork*.webp` assets and sample notes form an explicitly synthetic collection demonstration. No real artist, artwork or venue is asserted; replace them when the owner supplies the real example.
- Forms show field errors, pending states, honest retry states and a dedicated success panel. An explicit language switch carries the form draft once through session storage for at most 30 minutes and retains safe campaign labels; email never enters the URL.
- Admin separates signups, analytics and requests. Reset clears filters synchronously; export uses the displayed applied filters. Failed refreshes identify stale data and disable export. Charts contain all 30 calendar days and may fail independently of rows. Counts are unique database records in the selected list; The current app goal counts verified active emails; GA4 creation events exclude retries (measurement v2).
- Withdrawn records stay out of active lists and exports; repeating a public signup cannot silently reactivate them. Privacy requests identify app, visits or both; ownership verification remains manual.
- Local `/admin/` and `/qa/` routes are development-only. The dev server uses a local CSRF cookie on HTTP; production always uses a Secure `__Host-` cookie and Vercel deployment protection.
