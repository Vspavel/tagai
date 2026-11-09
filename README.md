# TAGAI — tagai.art

Production landing page in English, French and Greek, with a first-party waitlist API and PostgreSQL storage. No mailing-list SaaS, browser storage of subscriber data, or embedded tracking scripts.

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
- Build: `npm test && npm run build`. It applies additive, idempotent schema creation before generating the static site. A deployed build fails if the database is unavailable.
- Push a feature branch, review its preview and CI results, then merge into `main` for production. This workflow requires the GitHub App to have access to this repository and the Vercel Git connection to be active.
- Vercel preview authentication remains enabled. The custom production domain is public.
- The daily authenticated `/api/cleanup` cron removes expired data. Do not remove `CRON_SECRET`.

## Waitlist operation

Open Vercel → Storage → `tagai-waitlist` → Open in Neon → Tables. `waitlist_signups` contains the email, optional city, language, signup/consent timestamps and consent version. A unique normalized email prevents duplicate rows and prevents a new request from overwriting an existing choice.

These are **unverified email registrations**, not application accounts. No password is collected, and this version does not send automatic emails. Confirm address ownership before sharing private information or granting account access. Set up an authenticated sender and an unsubscribe mechanism before sending launch invitations at scale.

Review `privacy_requests` regularly. Verify ownership through a private reply before disclosing or editing records; then perform the requested action and mark the request resolved. The public form records a request for review; it does not claim that deletion has already occurred. Waitlist records expire after 12 months. Network addresses are never stored directly; rotating keyed rate-limit hashes expire after 2 hours and the daily cleanup removes them within 48 hours.

The API has same-origin checks, request-size limits, input validation, signed address-bound form challenges, honeypots and a shared database limit of 20 submissions per network per hour. This is basic abuse protection, not a CAPTCHA or verified-email service. Monitor usage and tighten limits if attacks occur.

## Source and assets

`src/locales.mjs` contains editorial translations; `src/forms.mjs` contains live form and privacy text. `build.mjs` generates `/en/`, `/fr/`, `/el/` and the English root. No front-end framework is needed for this landing page.

Photographs and TAGAI marks were supplied by the project owner for this website. They are not licensed for general reuse. Inter and Roboto Condensed are locally hosted under the included OFL licenses; no trial fonts are deployed.

Only the landing page and waitlist are operational. Product descriptions refer to the planned March 2027 early access. Do not label studio participants or VIMA as confirmed commercial partners without an explicit agreement.
