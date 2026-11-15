# Architecture

CareRelay keeps presentation, application state, transport and authorization in separate modules. The live application uses browser ES modules without a framework or frontend bundler.

## Module responsibilities

| Module                  | Responsibility                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `live.mjs`              | Owns private application state, coordinates refreshes and form submission, and dispatches UI commands through an explicit command registry. |
| `ui/components.mjs`     | Shared markup primitives, input fields and HTML escaping. User-provided values must pass through `esc` before interpolation.                |
| `ui/account-views.mjs`  | Renders account and circle-onboarding screens from the supplied state snapshot.                                                             |
| `ui/care-views.mjs`     | Renders care records, participants, history, plans, inbox and brief views using `getState` and scoped selectors.                            |
| `ui/shell.mjs`          | Selects page content and renders the application layout and navigation.                                                                     |
| `ui/plan-dialog.mjs`    | Builds the prescription-proposal form independently of dialog lifecycle and submission.                                                     |
| `ui/accessibility.mjs`  | Manages focus identity/restoration, error-summary focus and pending-control state.                                                          |
| `lib/http-client.mjs`   | Same-origin JSON transport, timeouts, safe response errors and an authentication-expiry callback.                                           |
| `lib/api-core.mjs`      | Validates each action once, normalizes its payload and maps it to the `care_mutate` gateway.                                                |
| `lib/public-assets.mjs` | Explicit public asset allowlist shared by static packaging, the local server and the browser integration harness.                           |

Views receive `getState` and selector functions rather than owning mutable application state. Rendering does not make network requests or write database records. The controller performs those operations and supplies the next authorized state snapshot.

## Request and data boundaries

The browser sends JSON requests to the same-origin Vercel HTTP handler. The existing server adapter verifies the Supabase identity and manages HttpOnly cookies. Validated actions enter the existing PostgreSQL mutation gateway, where membership, role permissions, idempotency, ownership and approval rules remain enforced.

This refactor does not change the server adapter, SQL permissions or database schema, and requires no database migration. The standalone demonstration remains separate from the persisted live application.

## Maintenance

Add a new action through a named controller command and one explicit API validator. Keep presentation in the relevant view module and update the public asset allowlist when adding a browser module. Keep provider credentials, test harnesses and server modules outside the public asset list.
