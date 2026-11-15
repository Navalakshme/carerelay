# Development log

## 2026-11-15 - Foundation

Prepared the project brief, security requirements, implementation sequence, and repository hygiene check with Codex. Verified Git and the Antigravity command are available. Application development in Antigravity has not started; no Antigravity-generated implementation is claimed.

## 2026-11-15 - Interactive prototype

Implemented with Codex: a buildless HTML/CSS/JavaScript demo in the selected Peach & Plum direction; separate care domain rules; in-memory fictional records; dose uncertainty and duplicate blocking; simulated relay escalation; future plan time approval; demo member revocation; and visit-brief approval/export. Added Node's built-in test suite and a loopback static server without third-party runtime dependencies.

This work was not performed in Antigravity. Real accounts, database transactions, shared care circles, invitation redemption, and durable notification delivery remain unimplemented. The prototype is an inspection milestone and does not satisfy all submission gates.

## 2026-11-15 - Saved-care milestone

Created and applied the private Supabase schema; implemented sign-in with the official SSR SDK, cookie-based server sessions, authenticated circle RPCs, private single-use invitations, transactional dose/ownership writes, revocation and revision-bound brief approval. Preserved the fictional demo separately. Ran 14 Node tests, syntax/build checks, and rollback-only database security tests. Real email sign-up and two-browser verification require account-owner interaction and are not claimed. See `live-backend.md` for boundaries. This work was performed with Codex, not Antigravity.

## 2026-11-15 - Quality upgrade

Implemented with Codex: a testable HTTP boundary, stale-read guards, deterministic approved snapshots, recipient-bound invitations, limited viewer visibility, idempotent mutations, append-only corrections, prescription proposals/approvals, daily occurrences, a durable in-app inbox and timed backup worker. Added a lockfile, CI, PostgreSQL migration/permission tests, actual concurrent ownership tests and a browser journey through the real HTTP handler and database. Automated axe, keyboard focus and mobile overflow checks cover the tested screens. This does not claim hosted email delivery, full WCAG certification, independent penetration testing or Antigravity development.
