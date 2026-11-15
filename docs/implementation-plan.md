# Implementation plan

## Proposed architecture

A TypeScript web application, a relational database, a maintained authentication system, and a durable notification worker. Choose and pin concrete framework versions during application scaffolding after checking current official documentation. Avoid unnecessary services and dependencies.

Proposed modules: identity, circles, consent, medication plans, dose occurrences, dose events, appointments, handoffs, and notifications. Keep domain rules outside UI components so they can be tested without a browser.

## Build sequence

1. Establish application tooling, lockfile, strict typing, linting, formatting, migrations, and CI on `main`.
2. Implement accounts, circle membership, passcode invitations, role checks, and revocation. Test cross-circle access before adding health workflows.
3. Implement approved medication plan versions, dose occurrences, event history, and appointments.
4. Implement reminder outbox, worker retries, ownership handoffs, and clock-controlled integration tests.
5. Add elder-focused UI, caregiver workspace, accessibility checks, and visit briefs.
6. Verify the full fictional demo, security cases, setup instructions, source size, and exactly one remote branch.

## Evidence for evaluation

Do not assume the evaluator's hidden scoring rubric. Make quality inspectable through small cohesive modules, reproducible setup, truthful implementation status, meaningful tests, clear failure behavior, and documented tradeoffs.

Required evidence: passing type/lint/build checks; migration reproducibility; access-control integration tests; duplicate-safe workflow tests; notification failure recovery; accessible core flows; and a concise demo script. Do not claim passing checks that have not run.

## Submission procedure

Use only `main`. Exclude generated assets, dependencies, local databases, and secrets from commits. Audit tracked files and Git history before publication. Verify public visibility and remote heads after pushing. Keep well below 10 MB, including history where feasible. Submit only after the completed application is verified; preserve both allowed attempts until then.
