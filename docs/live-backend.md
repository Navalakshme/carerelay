# Saved-care milestone — 15 November 2026

## Architecture and boundaries

Vercel serves the static UI and `api/care.mjs`, a same-origin backend for the frontend. Supabase Auth manages users and sessions. The official SSR client handles session cookies and refresh. Cookies are Secure, HttpOnly, SameSite=Lax and are never returned to browser JavaScript. Mutations require the exact configured origin and JSON; payloads are limited to 8 KiB. API responses are private/no-store.

The server uses only the existing Supabase publishable key, not a service-role key. `getUser()` validates identity before protected operations. Database functions derive the actor from `auth.uid()` and never accept a client-supplied actor or role.

All application tables live in the unexposed `care_private` schema, with RLS enabled and no client table grants. The Data API exposes only explicitly granted `care_*` functions to authenticated users; anonymous execution is revoked. Functions use a fixed empty search path and explicitly check circle membership and role. Circle locks serialize writes and membership revocation; dose rows are locked for reports and ownership claims.

Invitations use two random UUIDs, are stored only as SHA-256 hashes, expire after 24 hours, and can be redeemed once. Only the elder can create/revoke invitations or remove members. Joining requires authentication; failed join attempts are limited to 10 per account per hour. An invitation code is displayed once and should be shared privately. It is never put in a URL, log, or browser storage.

Reports preserve uncertainty and reporter identity. Reusing the same request UUID and identical report is idempotent; conflicting or duplicate terminal reports are rejected. Removing a helper releases their open assignments. The next database request from a revoked member is denied, although data they already saw cannot be recalled.

The UI polls the server every 15 seconds while active, avoiding form interruption. It does not use WebSockets or claim instant realtime delivery. Offline writes are not supported. Circles and health records are not stored in localStorage. Viewers are read-only. An approved brief is tied to the circle revision, which is invalidated by subsequent care events.

## Setup already applied

- Supabase project: `uzqjuhonpdrvgdwihyky` (CareRelay), Asia-Pacific allocation in Tokyo.
- Applied `supabase/001_care_backend.sql` through the project SQL editor.
- Connected the production Vercel environment with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN`.
- Production origin: `https://carerelay-sand.vercel.app`.
- Email confirmation remains enabled; no auth protection is disabled to make testing pass.

## Executed verification

- 14 local Node tests passed: nine existing demo domain cases plus five API validation/error-boundary cases.
- UI/API module syntax checks and the static asset build passed.
- Executed `supabase/002_security_tests.sql` against Supabase. It passed cross-circle read/write isolation, direct-table denial, viewer mutation denial, revoked-member denial, single-use invitations, report retry idempotency, preserved uncertainty history, duplicate/conflicting outcome rejection, single ownership, owner release on removal, brief approval invalidation, and anonymous RPC privilege denial.
- Tests used transaction-scoped synthetic auth identities with no passwords or login tokens. All fixture rows rolled back. They do not prove a real email sign-up or two-browser session flow.

## Still to validate with the account owner

Create the first CareRelay application account (separate from the Supabase dashboard account), confirm its email in the same browser, create a fictional care circle, then invite a second independently signed-in account. Verify that a report survives refresh and appears in that second session. Password entry and email confirmation are completed by the user. No real health records are needed for this check.

Supabase's built-in email service may restrict recipients and sending volume; custom SMTP must be configured before inviting arbitrary external users. Do not disable email confirmation to work around delivery limits.

## Remaining work

Live recurring schedules, prescription version proposals/approval, durable notification outbox, backup deadlines, email delivery, account recovery/deletion/retention workflows, monitoring, concurrent multi-client stress tests, and assistive-technology checks remain unfinished. The original richer fictional workflows remain at `/demo.html` and are explicitly separate from saved records. No real Antigravity development is claimed. This is an early release, not a completed clinical or submission-ready product.

Local network restrictions prevented installing SDKs locally. Exact direct dependency versions are pinned; transitive dependencies are not yet committed in a lockfile. Vercel installs the official packages during deployment. Do not claim local SDK integration tests or a reproducible dependency lock.
