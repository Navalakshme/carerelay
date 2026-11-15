# CareRelay

Elder-controlled medication coordination and accountable family care.

## Status

The saved-care milestone adds Supabase sign-in, private care circles, expiring single-use invitations, server-validated roles, persisted scheduled occurrences and dose reports, caregiver ownership, member revocation, and elder-approved visit briefs. The selected Peach & Plum design is preserved.

This is an early release. Recurring schedules, live prescription-change workflows, email reminders and timed backup escalation are not implemented. The original fictional demo remains at `/demo.html`; its records reset on refresh. Clinical decision support and emergency monitoring are outside scope.

Live site: https://carerelay-sand.vercel.app

Application accounts are separate from the Supabase dashboard account. Create an account, confirm the email in the same browser, then sign in. Start with fictional records. The elder creates an empty circle and shares invitation codes privately. Each invited person signs in independently. Saved records are checked for updates every 15 seconds.

See [backend implementation, setup and actual validation](docs/live-backend.md). Server environment variables are listed in `.env.example`; no service-role key is required. Exact direct dependency versions are pinned; a transitive dependency lockfile is pending. Install the official dependencies with `npm install` before running live server modules. Build static assets with `npm run build`.

## Run the demo

With Node.js 22 or later, from this folder:

```powershell
npm start
```

Open `http://127.0.0.1:4173/demo.html`. This local server serves the offline demo, not a local authentication backend. No API keys are needed for the fictional demo. Saved accounts use the deployed Vercel Function. The page works with system font fallbacks if optional Google Fonts cannot load.

Run the domain checks:

```powershell
npm test
```

In restricted Windows environments where Node reports an `EPERM` while resolving parent directories, use `node --preserve-symlinks --preserve-symlinks-main scripts/serve.mjs` and `node --preserve-symlinks --preserve-symlinks-main --test tests/domain.test.mjs`.

## Walk through the fictional story

1. Start as Anya. Report the morning outcome as **I'm unsure** and confirm. The care history retains this report.
2. Advance the demo clock by 30 minutes before acknowledging. Ravi becomes the assigned backup exactly once. Switch the demo role to Ravi and acknowledge ownership.
3. Open **Medication plan** and propose a different time. Today's occurrence stays at 08:00 while approval is pending.
4. Switch to Meera and approve the request. The approved time is shown for the next demonstration day; this prototype does not generate that day's occurrences.
5. Open **Visit brief**, add a question, approve as Meera, and download the text brief. A new care event invalidates that approval.
6. In **Care circle**, Meera can remove a participant. Their role disappears from this session's selector. Server-side session revocation remains future work.

`domain.mjs` contains care rules separately from `app.mjs` rendering. Tests cover duplicate and conflicting completion reports, uncertainty history, single ownership, one-time backup escalation, elder approval, demo role restrictions, revocation, validation, and brief approval invalidation. See [prototype validation](docs/prototype-validation.md) for actual checks and limitations.

## The problem

Elders, relatives, and caretakers often have separate versions of a medication plan. A reminder alone cannot establish whether a dose was taken, whether someone is helping, or whether a prescription changed. CareRelay will provide a shared record while letting the elder control participation.

## Proposed first release

1. Accessible elder screen with today's doses, appointments, and a request-help action.
2. Authenticated care circles with expiring invitation passcodes and revocable roles.
3. Dose events that distinguish reported taken, skipped, overdue, and uncertain outcomes.
4. Acknowledged caregiver handoffs with a designated backup and duplicate-safe email reminders.
5. Prescription change proposals with visible history and explicit confirmation before activation.
6. An appointment brief assembled from recorded events and approved by the elder before export.

See [the product brief](docs/product-brief.md), [security design](docs/security-design.md), and [implementation plan](docs/implementation-plan.md).

## Development

This repository starts on `main` and must retain exactly one branch locally and remotely. Do not create feature branches or accept automated branch-creating dependency updates. Work in small commits on `main`.

Open this folder in Google Antigravity. Record actual Antigravity development work in `docs/development-log.md`; never manufacture usage evidence.

Run the repository check from this folder:

```powershell
powershell -NoProfile -File scripts/check-repository.ps1
```

The check measures a tracked-source archive and Git storage separately; neither defines the organizer's unspecified repository-size measurement. Keep ample margin under 10 MB, avoid binary assets and generated files, and confirm the organizer's measurement before submission.

## Data and safety

Use fictional demonstration records only. Never commit real health records, credentials, database exports, or email addresses belonging to care recipients. The planned application coordinates recorded care; it must not recommend doses, diagnose conditions, or infer that a reminder acknowledgement proves ingestion.

## Submission constraints

- Public GitHub repository.
- Exactly one branch: `main`.
- Repository smaller than 10 MB.
- Maximum two submission attempts; creating or pushing a repository does not submit an entry.
- Verify all requirements again before submitting the final repository URL.

