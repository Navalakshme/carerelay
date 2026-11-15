# Product brief

## Product promise

Every care task has a clear state, an accountable helper, and an explanation the elder can understand.

## Roles

- Elder: controls membership and sharing; views and reports daily care; approves plan changes.
- Caregiver: manages only explicitly permitted care records; acknowledges assigned tasks.
- Family viewer: sees the elder-authorized summary; cannot change medication schedules.

An account may belong to multiple circles. Authorization must be checked against the selected circle for every operation.

## Distinctive features

| Feature | Specific behavior | Evidence in a demo |
| --- | --- | --- |
| Care relay | An overdue task goes to the chosen helper; acknowledgement assigns ownership; a timed-out handoff goes to the backup. | Advance a test clock and show one owner and one escalation. |
| Honest dose ledger | Separate scheduled dose occurrences from self-reported outcomes; retain who reported what and when. | Two devices report the same occurrence without duplicating completion. |
| Uncertain-dose flow | A person can report uncertainty and request caregiver review; the app never suggests taking another dose. | Show uncertainty without converting it into taken or skipped. |
| Elder consent controls | Invitations expire; roles restrict visibility; revocation ends access. | Revoke a viewer and show their next request denied. |
| Prescription change gate | Proposed edits show before/after values, effective time, author, and approval status. | Pending edits do not change active reminders. |
| Explainable reminders | Each reminder links to its scheduled occurrence and records why and to whom it was sent. | Retry a failed delivery without sending duplicate messages. |
| Visit-ready brief | Deterministic summary of recorded misses, uncertainties, changes, and questions, with source links. | Preview and approve a brief without invented medical conclusions. |

## Accessibility

Prioritize large touch targets, keyboard navigation, visible focus, text resizing, clear contrast, and text labels alongside icons. Offer a calm elder view separate from the caregiver workspace. English is the first release; Tamil and Kannada are planned only after critical flows pass accessibility checks.

## First demonstration story

An elder invites a daughter and a caretaker. A scheduled dose becomes overdue. The daughter acknowledges the request, preventing a second helper from claiming the same task. The elder reports that the dose outcome is uncertain. The record preserves that uncertainty. A proposed prescription edit remains pending until approved. A visit brief reflects the actual events. Revoking the caretaker immediately blocks further access.

## Deliberate scope limits

No autonomous medication changes, drug interaction predictions, diagnostic chatbot, emergency dispatch promise, or unverifiable medication-taking detection. Offline writes, AI prescription extraction, and refill estimates are later candidates, not first-release promises.
