# Approved prelaunch release — 10 November 2026

Source: approved ChatGPT Page `page_e8f4b4a0fd788191a23e1e969ce7762e`.

The English baseline and faithful FR/EL translations are in `admin/server/content-seed.json`. `scripts/prepare-prelaunch.mjs` reconstructs this baseline from the approved copy and translation files. Subsequent editorial changes belong in the CMS, not in the seed generator. The two artwork photographs were supplied by Pavel for this release; no general reuse licence is granted.

## Public pages

Home, institutional pilots, host proposals / guest announcements, two full encounters, and subscription management. Updates and the first March 2027 article remain excluded drafts until the first publication, no earlier than December 2026. No invented application functionality or pilot statistics are shown. EN / FR / EL remain public; the existing CMS requires all seven translations before its first full seven-language release.

## Data and forms

Existing app and visit records are retained. `update_signups` is independent. `enquiries` stores pilot enquiries and host proposals without adding them to subscriptions. Protected admin displays enquiry status with optimistic version checks, email confirmation filters and confirmed active counts. Records remain unconfirmed until an email link is explicitly confirmed. Confirmation retries cannot reactivate a subsequently withdrawn subscription. Form retries use an idempotency identifier, and modified payloads cannot reuse it.

Optional transactional delivery uses Resend as transport only. All audience data stays in the application's PostgreSQL database. Configure `RESEND_API_KEY`, a verified `EMAIL_FROM`, and `EMAIL_DELIVERY_ENABLED=1` in the public production project; add `EMAIL_REPLY_TO` and `ENQUIRY_RECIPIENT` for enquiry receipts and notifications. Redeploy after configuration. Until then forms store registrations and explicitly report that no confirmation email was sent. No key, sender or successful delivery is fabricated. Test a real confirmation, expiry, preferences and unsubscribe with a consenting team address before enabling mail at scale. Access links expire in 24 hours, carry an opaque fragment token, and are removed from the URL before analytics. Never put tokens or personal data in campaign labels.

Legacy unverified registrations are not silently confirmed. Data requests still require ownership verification before the operator acts. Old privacy requests with audience `both` now cover all three subscription lists.

## CMS compatibility

New documents are seeded without replacing existing pages. Untouched prior-baseline pages migrate to the approved structure with archived revisions; edited old pages are preserved for explicit reconciliation. Renderer schema is v2. A schema-v1 live snapshot cannot be used by the new renderer and the repository baseline is used until a v2 release exists. For rollback across this schema boundary, restore the previous Vercel deployment / Git commit. Within v2, normal immutable CMS release rollback remains available.

Mail provider activation, AI translation keys, Search Console OAuth and CMS deploy hooks are separate configuration steps. Missing integrations are shown as unavailable in admin, not as working services.
