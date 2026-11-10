# TAGAI content operations

## Architecture

English source and translations are versioned in cms_documents/cms_revisions. PostgreSQL tables are logically separated from signup data; they currently use the existing protected admin database connection (not a separate least-privilege database role). Only protected production admin routes can access CMS. Public runtime does not query drafts.

The repository baseline publishes all seven languages: English, French, Greek, Spanish, Italian, German and Russian. The build validates every translation before publishing. Translations include stories, forms and privacy notices. Do not publish English placeholders as translations. The same baseline seeds the admin editor without overwriting edited English sources.

An editor save creates durable translation jobs. The browser processes them immediately when a provider is configured; the authenticated Vercel cron worker also processes one queued job per invocation. Provider failures are recorded. Manual translation changes lock the affected translation fields; source changes require manual review of those locked fields. Limits: 50 translation jobs and 10 AI observations per UTC database day. Each translation job can call a primary and fallback provider; these are request-count limits, not a guaranteed currency budget. Set provider-side spending limits as well.

Publication stores an immutable whole-site snapshot, requiring matching source revisions and all seven languages. Only one pending release can exist. The public production build reads this snapshot. A release is marked live only after the admin fetches the matching release ID from https://tagai.art/content-release.json. Trigger errors retain the pending release; retry uses the same snapshot. Never clear a pending lock while a queued Vercel build could still publish it. If a build fails, inspect Vercel before retrying. Rollback makes a new snapshot from a previously confirmed CMS release. The repository baseline can be restored through Vercel's deployment rollback, not through CMS history.

Before publishing: inspect English and all translations, especially terms, consent and dates. Automated validation enforces key completeness, numerals, links and placeholders; it does not certify semantic or legal accuracy. The editor offers a text review; full visual preview deployments remain a development workflow, not an admin-hosted preview renderer.

## Activation — secrets only in Vercel, never in chat or Git

Project: tagai-admin, Production only:
- OPENAI_API_KEY and TRANSLATION_MODEL: a funded project key and a model supporting Chat Completions JSON mode.
- Optional independent fallback: TRANSLATION_FALLBACK_KEY and TRANSLATION_FALLBACK_MODEL for Vercel AI Gateway. Without them, provider outage leaves jobs failed and live content unchanged.
- AI_MONITOR_MODEL: a Responses API model supporting the web_search tool.
- CONTENT_DEPLOY_HOOK: a deploy hook for the *tagai* project's main production branch, NOT tagai-admin. Treat hook URL as a secret. Creating this hook grants publication capability and needs owner approval.
- CRON_SECRET: random secret for the scheduled worker. Vercel passes Bearer authorization. Keep admin deployment protection enabled. Verify an actual scheduled invocation succeeds without weakening protection.
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: Google web OAuth app with Search Console API enabled.
- CMS_ENCRYPTION_KEY: 32 random bytes as 64 hex characters, retained across releases. Losing it requires reconnecting Google.
- GSC_PROPERTY: sc-domain:tagai.art (default) or https://tagai.art/; the authorized Google account must have access.

Google authorized redirect URI (exact):
https://tagai-admin-vspa.vercel.app/api/search?callback=1

Use the protected admin's Connect Search Console button. Google access is readonly webmasters scope, using PKCE plus one-time browser-bound state; refresh tokens are encrypted at rest. Authorization and any new Google account permissions require the owner's confirmation. Do not copy a token from another app or browser session. No Search Console connection exists until OAuth completes successfully; configured env vars alone do not imply data access.

## Verification after activation

1. Translate one low-risk English change; verify six versions and the job history, then test configured fallback.
2. Create an article draft; inspect translations. Confirm publication. Verify release manifest, page HTML, sitemap and correct hreflang on production. Verify rollback using a harmless prior CMS release.
3. Connect Google and request data for a known page. No rows is distinct from no connection, not indexed, or API failure. Query rows are top 100, subject to Google anonymization; totals are fetched separately, not summed from visible queries. Dates use Search Console Pacific Time and a three-day lag.
4. Run one explicit AI-search question. Store model, answer, citations, timestamp and whether tagai.art was cited. These on-demand observations do not represent consumer ChatGPT or Google AI coverage. No automatic recurring AI monitoring is enabled in this version.
5. Confirm admin remains protected, snapshots contain no signup records, no secret appears in HTML, and public forms still work in all enabled languages.

## Automated tests

Run npm test, npm run build, and npm run build --prefix admin. Tests use isolated PGlite and injected provider fixtures, never production records. Live AI, Google OAuth, cron and deployment-hook activation must be verified separately with configured credentials.
