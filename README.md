# CareRelay

Elder-controlled medication coordination and accountable family care.

Live application: https://carerelay-sand.vercel.app

## Chosen vertical and persona

CareRelay targets elder care and family caregiver coordination. Its primary persona is an elder who needs a clear shared medication record while retaining control over participation and plan approval. Relatives and caretakers provide support through a private care circle. This describes the implemented vertical; the organizer's exact challenge title must be matched against the supplied challenge list before submission.

The problem is conflicting or incomplete care information: a reminder alone cannot establish whether a dose was taken, which helper is responsible, or whether a prescription change has been approved.

## Approach and decision logic

CareRelay is a context-aware, rule-based care assistant. Its runtime decisions use the selected circle, authenticated role, circle timezone, scheduled time, reported outcome, helper assignment, acknowledgement and elder approval. It does not use a language model or generate clinical conclusions.

- A due, unresolved occurrence creates an in-app check-in reminder for the assigned helper, or the elder when no helper is designated.
- If nobody acknowledges within 15 minutes and an active backup is designated, responsibility moves to that backup once. Transactional claims prevent two helpers owning the same check-in.
- An uncertain outcome stays uncertain until another explicit report or correction. The assistant never interprets uncertainty as permission to take another dose.
- A proposed prescription plan stays pending until the elder approves it. Approval schedules bounded daily occurrences; a replacement preserves completed records and cancels only applicable future unreported occurrences.
- A family viewer receives daily counts and participant information. Care details, questions and brief exports remain restricted to the care team.
- New care events invalidate brief approval. Export requires a current, server-stored snapshot approved by the elder.

## How the solution works

1. Create an account, confirm its email and sign in. The elder creates an empty care circle and chooses its schedule timezone.
2. Invite a participant using their sign-in email and a privately shared, single-use code. Each participant signs in independently.
3. Add an occurrence from an existing prescription, or propose a daily plan for elder review. Choose a primary and backup caregiver when available.
4. Open the inbox to see due check-ins. A caregiver acknowledges responsibility; the elder or caregiver records the observed outcome. Corrections retain the previous report and its source reference.
5. Review history, add visit questions, preview the brief and obtain elder approval before downloading its saved snapshot. Remove membership or revoke unused invitations when access should end.

Browser requests pass through a same-origin Vercel function. It verifies the Supabase identity before invoking private PostgreSQL functions. The database enforces role permissions, idempotency, concurrent ownership and approval rules. A database job creates inbox reminders every minute even while browsers are closed. The frontend retrieves authorized updates every 30 seconds while active.

## Assumptions and scope

- Participants have internet access and their own confirmed-email accounts. A participant must open the application to see an inbox reminder; external email, SMS and push reminders are not implemented.
- The elder is the circle owner. Caregivers may report observations and propose plans; only the elder approves plans and controls membership.
- Medication labels and instructions come from an existing clinician prescription. Reports and acknowledgements are human statements, not proof of ingestion or a medical assessment.
- Daily plans contain 1-30 occurrences. The selected circle timezone controls display and recurrence; date inputs explicitly identify the device timezone.
- Records are saved online. Offline changes are not queued, and no emergency response or monitoring is promised.
- Demonstration records describe imaginary people. Automated test identities have no usable passwords. Credentials and database exports must stay outside the repository.
- The implementation uses deterministic rules rather than conversational AI. Eligibility depends on the selected challenge allowing this approach. See [validation scope and remaining assurance work](docs/quality-validation.md).

## What works

- Confirmed-email accounts and server-managed HttpOnly sessions.
- Private circles with elder, caregiver and summary-only family viewer roles.
- Recipient-bound, expiring, single-use invitation codes and immediate membership checks after revocation.
- Scheduled dose occurrences, self-reported outcomes and append-only corrections with observation and receipt times.
- Prescription proposals with before/after details, explicit elder approval and 1-30 daily occurrences at the circle's local time.
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
