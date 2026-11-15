# CareRelay

Elder-controlled medication coordination and accountable family care.

## Status

Planning and repository foundation only. No application, authentication, notification service, or clinical decision support is implemented yet.

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
