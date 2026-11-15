# Live backend

The production backend uses a Vercel function as a browser-facing boundary and Supabase Auth/PostgreSQL as the identity and data store. Browser JavaScript receives public user details and authorized care records, never an access or refresh token. Server cookies are HttpOnly, Secure and SameSite=Lax. Every protected request verifies the user with Auth; every database operation checks active membership.

Private tables have RLS enabled and no anonymous/authenticated table grants. Security-definer RPCs use an empty search path and explicit object qualification. Only the small read surface and idempotent mutation gateway are granted to signed-in users. The elder controls membership and plan approval. Viewers receive daily counts and participants, without medication details, questions, source events or brief exports.

Apply migrations in order: 001, 003, 006, 005. Execute rollback-only test 002 before 003, and 004 after 003. The original security suite is preserved for the original schema rather than weakened to fit new permissions. Migration 003 is additive and must run only once. Migration 005 uses Supabase pg_cron for the inbox worker. No service-role credential is used by the web application.

The mutation gateway fingerprints the validated payload and remembers each account-scoped request key for seven days. It serializes writes and rechecks circle access before replay. Different payloads cannot reuse a key. Raw invitation codes are never retained in request history. Reminders use unique occurrence/recipient/stage keys, and ownership, report and membership changes lock the circle transactionally. Correction events reference previous reports without replacing the original ledger entries.

A plan remains pending until the elder approves its version. Approval generates a bounded set of daily occurrences using calendar days in the circle timezone. Replacements cancel only future unreported occurrences from the old plan. The original plan, author, decision and completed occurrences remain available in history.

The visit brief is a scoped deterministic rendering of saved records. Elder approval stores a snapshot, actor, timestamp and revision. Export rechecks both membership and the current circle revision on the server. New care events invalidate approval. Snapshot export excludes invitation metadata and inbox contents.

The browser polls every 30 seconds only while active, does not overlap stale reads, and uses revision comparisons for unchanged responses. Requests have timeouts. It retains only the selected circle ID in account-scoped session storage, with no cached care records or offline write queue. See [quality validation](quality-validation.md) for tested boundaries, reproducible commands and remaining assurance work.
