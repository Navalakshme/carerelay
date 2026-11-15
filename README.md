# CareRelay

Elder-controlled medication coordination and accountable family care.

Live application: https://carerelay-sand.vercel.app

## What works

- Confirmed-email accounts and server-managed HttpOnly sessions.
- Private circles with elder, caregiver and summary-only family viewer roles.
- Recipient-bound, expiring, single-use invitation codes and immediate membership checks after revocation.
- Scheduled dose occurrences, self-reported outcomes and append-only corrections with observation and receipt times.
- Prescription proposals with before/after details, explicit elder approval and 1â€“30 daily occurrences at the circle's local time.
- Durable in-app reminders and a designated backup handoff after 15 minutes without acknowledgement. One helper owns a check-in at a time.
- Paginated care history and deterministic visit briefs, approved and stored on the server before download.
- Duplicate-safe writes, account-scoped request keys and stale-response protection when switching circles.

Reminders appear in the application inbox; external email/SMS/push and emergency monitoring are not connected. The application does not diagnose, prescribe, recommend another dose, or verify ingestion. Use imaginary demonstration records for the hackathon. The separate offline story at `/demo.html` resets on refresh.

## Development

Use Node.js 22:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
```

`npm start` opens a loopback static server at `http://127.0.0.1:4173/demo.html`. It serves the offline demonstration; saved accounts use the deployed Vercel Function. The frontend has no framework build dependency and requests no third-party fonts.

See [quality evidence and limitations](docs/quality-validation.md), [backend setup](docs/live-backend.md), [product brief](docs/product-brief.md) and [development log](docs/development-log.md). CI runs syntax/format checks, unit/API tests, actual PostgreSQL tests, simultaneous ownership claims, browser integration, automated accessibility, dependency audit and build checks.

## Backend setup

Configure the three variables in `.env.example` in Vercel. No service-role key is required by the application. For a new Supabase project apply `001_care_backend.sql`, then `003_quality_upgrade.sql`, then `006_approval_revision.sql`, then `005_reminder_schedule.sql`. For an existing project already on 001, apply only 003, 006 and 005. Migrations preserve care records. Historic unused unbound invitation codes are revoked; create a new recipient-bound code when needed.

Enable email confirmation. Set the Auth Site URL to the production origin and redirect allowlist to `/api/care` and `/api/care?flow=recovery` on that same origin. The project owner controls SMTP delivery. Each participant uses their own confirmed account; the owner creates a circle and shares the code privately with its named email recipient.

## Test the live code locally

Create an empty disposable PostgreSQL database named `carerelay_test` on loopback. Set `DATABASE_URL`, then run:

```sh
npm run test:db
npx playwright install --with-deps chromium
npm run test:browser
npm audit --audit-level=moderate
```

The browser harness replaces only the identity provider, uses fixed synthetic identities without usable passwords, and executes the real HTTP handler and PostgreSQL RPCs. It never connects to the hosted care database. Hosted Supabase authentication/email must also be checked independently. The integration harness is excluded from the deployment.

## Repository and submission

Keep exactly one branch, `main`, and keep source and Git storage below the organizer's 10 MB limit. Do not commit dependencies, build output, credentials or database exports. `scripts/check-source.mjs` enforces a 9 MB source budget; the PowerShell repository check also measures Git storage and remote branches.

The public repository is not itself a hackathon submission. The organizer permits at most two submission attempts. Complete authentic Google Antigravity development and record it if required; the existing Codex work is identified honestly in the development log. No judge score is guaranteed.
