# TAGAI measurement v2 — 11 November 2026

The app waitlist goal is **1,000 unique normalized emails that are verified, active and unexpired in `waitlist_signups`**, excluding `source='INTERNAL_QA'`. It is a current database count, not GA4 users/events, all forms combined, or a count of proven distinct humans. A person with two separately verified mailboxes can still count twice.

## Attribution

Use external links with `utm_source`, `utm_medium`, `utm_campaign` (optional content/term); ASCII campaign labels up to 80 characters: e.g. `/en/?utm_source=instagram&utm_medium=social&utm_campaign=encounter_awad`.

The shared attribution script carries only these labels across same-origin localized links, anchors and language changes. Explicitly tagged destinations keep their own campaign; external links never receive them. Form payloads are independent of where the CTA lives. Without analytics consent, only the current URL journey is preserved. With consent, first and last known campaign labels are retained for 30 days of inactivity; direct visits do not overwrite them. Revoking consent clears that memory. No email, token, arbitrary query string or cross-device identity is stored in attribution.

The server validates the payload. Original `source` and `campaign` remain unchanged on duplicates. The JSON attribution records first and last campaign labels; a later request can update only last touch. Confirmation uses the stored acquisition, including when the email is opened on another device. Historical missing sources cannot be reconstructed reliably.

## Event contract

| Event | Trigger | Key event |
| --- | --- | --- |
| waitlist_cta_click | Same-origin localized home URL ending in #waitlist, including query parameters | No |
| waitlist_form_start | First input into the app waitlist form on the page | No |
| waitlist_submit_success | Database inserted a new app email row | No |
| app_waitlist_confirmed | Verified email first becomes an active app subscriber | **Yes** |
| app_waitlist_reactivated | Previously verified app record becomes active again after withdrawal/expiry | No |
| visit_subscription_created | New visit-announcement email row | No |
| updates_subscription_created | New project-updates email row | No |
| enquiry_submit_success | New enquiry request ID; `form_kind=pilot` or `visit` | No |
| waitlist_submit_error / form_submit_error | Submission was not confirmed by the server | No |

All events require current analytics consent. Parameters are allowlisted: `language`, `signup_audience`, `measurement_version=2`, relevant `form_kind`, `acquisition_source`, `acquisition_medium`, `acquisition_campaign`. The latter three reflect the first known campaign of the original signup. Email addresses and confirmation tokens never go to Google.

Creation comes from `INSERT ... ON CONFLICT ... RETURNING`; activation comes from atomic updates that return only a genuine inactive/unverified/expired → verified-active transition. Same request IDs, normalized-email duplicates, repeated confirmation tokens and simultaneous requests cannot create additional first confirmations. Re-activation has a separate event. GA4 events are not a current membership gauge: unsubscribes/expiry reduce the database goal without erasing historical events.

## GA4 configuration

Property: TAGAI — tagai.art, 563297588. Web stream: G-JRWDCHPFYB.

Configured in TAGAI GA4 on 11 November 2026: `app_waitlist_confirmed` is a key event, once per event, with no monetary value. `waitlist_submit_success` is no longer a key event; historical data is preserved. Do not create a conversion from generic `form_submit` or a button click. Registered five event-scoped custom dimensions: acquisition source/medium/campaign, signup audience and measurement version. Native session/user acquisition and these signup-acquisition dimensions answer different questions.

Review the funnel: page view → CTA → form start → new record → first confirmed email. Read channel reports in GA4, and actual active emails by source in Admin → Analytics. Do not divide the all-visitor database total by consented GA4 users. Browser delivery can be blocked or interrupted; database counts remain authoritative. A server Measurement Protocol outbox is a possible subsequent enhancement, but does not remove consent requirements or turn GA4 into an exact-once ledger.

## Email validation and operational gate

Syntax validation, trim/lowercase normalization, IDNA domain normalization, database uniqueness, rate limiting and confirmation links already form the validation chain. We do not strip plus tags or Gmail dots: blindly merging aliases across providers can combine different mailboxes. Syntax alone does not prove ownership; unverified addresses do not count.

Production mail delivery needs RESEND_API_KEY, a verified EMAIL_FROM domain/address and EMAIL_DELIVERY_ENABLED=1. At implementation inspection those variables were absent. Until a provider is connected, requests remain stored but pending verification. Do not mark them verified or send a bulk confirmation campaign without an explicit instruction. Successful confirmation proves mailbox control at that time, not permanent deliverability; bounce monitoring is a separate integration.

## Acceptance

Test URL attribution through story and language change, declined/blocked storage, first/last campaign behavior, all seven CTA URLs, no PII in GA4, normalized duplicates, concurrent creation/confirmation, unsubscribe/replay/reactivation, expiry, separate audiences and filter-independent goal counts. Production QA must not fabricate subscriber records. Confirm live mail delivery with an owner-approved address after provider setup.

Validation: 51 automated tests pass against the real schema/SQL in isolated PostgreSQL-compatible storage, including simultaneous duplicates, activation transitions and repeated migrations. Public and admin builds pass. Local browser journey EN home → Sarah Awad → RU → waitlist retains all campaign labels. Production email delivery remains untested until a provider and approved recipient are available.
