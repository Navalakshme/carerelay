# Security design and acceptance gates

These are implementation requirements, not claims of completed security controls or regulatory compliance.

## Trust boundaries

The browser is untrusted. The server authenticates each session, validates every input, and checks role and circle membership before database access. Possessing an identifier or an invitation code must not grant unrestricted access to health records.

## Authentication and invitations

- Use a maintained authentication library rather than custom session cryptography.
- Treat passcodes as single-use, expiring invitations bound to the intended circle and role; store only a suitable one-way representation.
- Rate-limit code verification by account, network, and invitation; use generic failure responses and expiry.
- Require an authenticated identity before redeeming a code. Do not use a shared permanent family PIN as the only security boundary.
- Use secure, HttpOnly, SameSite cookies; enforce CSRF protection for mutations and invalidate revoked sessions or memberships promptly.

## Data integrity

- Database transactions and unique occurrence identifiers prevent duplicate dose completion and handoff claims.
- Separate reported event time, server receipt time, author, and provenance. Corrections append events rather than silently replacing history.
- A dose acknowledgement is a report, not proof of ingestion.
- Prescription versions have explicit effective times. Pending edits cannot affect active schedules.
- Persist local schedule timezone and resolve daylight-saving transitions deliberately; server jobs operate on explicit instants.
- Use an outbox and idempotency keys for notification jobs; retries and provider failures must be observable.

## Privacy

- Minimum health information in email: a care task needs attention and a secure application link. Do not include medication names or condition details by default.
- Secrets remain server-side. Redact logs; do not log health payloads, passcodes, session tokens, or export content.
- Export requires authorization and explicit user action. Avoid sensitive browser caches and health records in persistent local storage.
- Document retention, member revocation, and deletion behavior before real-world use.

## Required adversarial checks

1. A member of circle A cannot read or mutate circle B by changing an identifier.
2. A viewer cannot call caregiver mutation endpoints directly.
3. Expired, reused, guessed, and revoked invitation codes fail.
4. Concurrent dose submissions and caregiver claims do not produce duplicate terminal actions.
5. A revoked member's existing session cannot access protected circle records.
6. Notification retries, downtime recovery, and schedule edits do not duplicate or resurrect obsolete reminders.
7. Untrusted input renders as text; validation covers malformed payloads and oversized requests.
8. Logs, repository history, error responses, and client bundles contain no secrets or real health data.

Before release: dependency review, authorization integration tests, keyboard/screen-reader checks, and manual end-to-end verification. Document actual results and residual limitations.
