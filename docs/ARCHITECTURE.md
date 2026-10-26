# Architecture

Status: authoritative Build 1 technical direction. Product behavior remains governed by [PRODUCT_SPEC.md](PRODUCT_SPEC.md) and [GAME_RULES.md](GAME_RULES.md).

## System shape

- Responsive browser application
- Next.js, React, TypeScript
- Modular monolith
- REST API as the official application boundary
- PostgreSQL 17 with Prisma 7 and the PostgreSQL driver adapter
- Auth.js with Google OAuth only for Build 1
- Docker Compose, local-first development
- Server-authoritative gameplay
- Version-controlled configuration and seed data

Implemented tooling: pnpm, Tailwind CSS, Zod, Vitest, React Testing Library, Playwright, and GitHub Actions. UI components live in `src/components/`; shadcn/ui is not an installed dependency. See [package.json](../package.json) and the lockfile for dependency versions.

Future web/mobile clients must be able to reuse the REST boundary. Server Actions may support isolated web-only behavior but must not be the sole authoritative interface for core gameplay.

## Conceptual modules

Implemented directories under `src/modules/`: `auth`, `player`, `quests`, `progression`, `challenges`, `recommendations`, `admin`, and `jobs`. Streak helpers live inside `progression`; there are no separate `flourish` or `streaks` module directories.

Modules may share one deployable and database while exposing explicit services and ownership. Avoid circular domain ownership. Core transitions should enter through application services invoked by REST handlers, jobs, and lazy reconciliation paths.

## Authentication boundary

Keep `User` and provider `AuthAccount` identity separate from `Player` game state. MVP is one User to one Player without unnecessarily blocking future expansion. Named environment placeholders may include `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, and `DATABASE_URL`; real values belong only in ignored local environment files.

Build 1 User roles are `PLAYER` and `ADMIN`. Both `/admin` and admin mutation endpoints enforce `ADMIN` authorization on the server.

### Phase 03 implementation

Auth.js uses stable `next-auth` 4.24.15 (whose peer range includes Next.js 16), the App Router auth handler, and `getServerSession`. The installed handler awaits Next.js request headers, cookies, and route params. Google is the only provider, and sign-in requires a verified Google email. A custom adapter maps the existing User/AuthAccount models, creates the User and initial Player together, and does not retain Google tokens. Email is trimmed/lowercased without Gmail dot/plus rewriting. Auth.js safe account-linking behavior remains enabled: matching email alone does not merge identities; account-owner collisions fail. Concurrent initial creation can safely fail one competing OAuth attempt rather than claim an existing identity.

Encrypted, HTTP-only JWT sessions contain persisted User identity, not gameplay state or provider credentials. Server session resolution reads current email, role, Player ID, and onboarding timestamp from PostgreSQL; role changes take effect on the next protected request. Sign-out clears the browser session; this phase has no server-side JWT revocation list. `AUTH_SECRET` rotation invalidates existing tokens. Session lifetime is seven days; no production test-auth bypass exists.

`src/modules/auth/` owns configuration, adapter mapping, session resolution, and reusable User/Player/completed-onboarding/admin guards. `src/modules/player/services.ts` owns bootstrap, onboarding, respec, timezone, and integrity services. `src/modules/player/api.ts` supplies thin, dependency-injected REST handlers; the production composition obtains identity only from the verified session. Identity endpoints and the read-only `/api/admin` guard probe return JSON and `Cache-Control: no-store`. Implemented curation endpoints under `/api/admin/quests` and `/api/admin/references` use `requireAdmin` through [createAdminApi](../src/modules/admin/api.ts). The [admin service](../src/modules/admin/service.ts) provides transactional edits/review transitions, stale-edit checks, and audit records; there is no role-management UI.

Cookie-authenticated application mutations require matching Origin, JSON content type, and server-side strict schemas that reject client User/Player/role fields. Auth.js manages OAuth state/PKCE and its own CSRF-protected sign-in/sign-out flow. Public landing/login remain accessible; incomplete players are directed to onboarding, completed players to the minimal Home/Settings pages, and non-admins get a safe not-authorized redirect (API: 403). Secrets remain in server-only configuration. Missing local OAuth configuration disables sign-in with setup guidance; builds need no OAuth secrets or live database.

Unit tests use pure guards/domain validation; PostgreSQL tests inject a fixture-backed session resolver into the exact REST handler factory. Playwright creates isolated User/Player fixtures and normal Auth.js encrypted session cookies using a temporary test-process secret. No test route, production flag, or client-supplied identity bypass is added. Browser tests require a migrated, seeded disposable `E2E_DATABASE_URL`; they delete only their own User fixtures. The older constraint integration suite still requires a disposable database because it truncates public fixtures.

## Atomic gameplay operations

### Phase 04 Standard Quest engine

`src/modules/quests/standard/` separates pure scoring/tier selection, content validation, transaction context, slot reconciliation, lifecycle actions, response mapping, and REST adapters. First Home/API access lazily creates three Standard slots per canonical Skill and fills all 24 in one transaction. A Player row lock serializes population and mutations for that Player; shared library locks keep definitions and their allocations stable while offers are validated or accepted. Reads reconcile invalid AVAILABLE content but preserve accepted and uncleared-expired blockers. Assignments never change merely because Home reloads or Focus changes.

Quest generation uses configured level-band difficulty weights. Candidate scores multiply difficulty, reward-weighted Focus, reward-weighted Catch-Up, recent variety/history, and bounded randomness. Current duplicates and the immediate reroll definition are hard exclusions. Recent completed definitions and same reroll variety are soft exclusions and relax when necessary. Catch-Up does not alter the fixed three slots per Skill. Randomness is injected for deterministic tests; production randomness runs only inside authoritative assignment transactions.

Accept, reroll, and harder-family actions enter through authenticated REST services and resolve ownership from the session. Acceptance snapshots the current valid definition and calculates an exact elapsed-hour deadline. An already valid ACCEPTED quest returns idempotent success. Reroll and upgrade atomically retain the old PlayerQuest as `REROLLED`, append interaction history, create one AVAILABLE replacement, and repoint the same slot. Upgrade directly selects the closest eligible higher family tier, skipping absent, invalid, or currently occupied tiers.

### Phase 05 Standard resolution

Authenticated Standard reads and resolution mutations lazily reconcile overdue accepted quests. A Player row lock serializes all progression, streak, lifecycle, and slot changes for one Player, which covers same-Skill and overlapping multi-Skill requests without lost updates. Completion locks through this context, uses immutable acceptance snapshots and one operation timestamp, writes the reward and ledger, updates progression/levels and streaks, marks the quest complete, then selects its replacement using updated progression. Abandon applies its calculated penalty before refill. Expiration stores penalty facts but leaves the slot blocked and XP untouched; explicit clear applies the stored per-Skill penalty before refill. Database uniqueness plus the status/slot boundary prevents duplicate rewards and penalties.

### Phase 07 streak completion

Phase 07 reuses the Phase 05 completion transaction as the authoritative Skill-streak write pattern. Player-facing reads derive an effective streak from the stored local qualifying date without writing merely because time passed, and expose active state plus progress toward the next configured bonus tier. Calendar helpers use the Player's IANA timezone; a Monday-based local-week helper supplies Phase 08 Challenge windows. Daily and Weekly Challenge completions advance this same per-Skill streak state and never create a separate Challenge streak.

### Phase 08 Challenge engine

`src/modules/challenges/` owns timezone-window calculation, constrained Daily/Weekly selection, lazy reconciliation, lifecycle/progress services, reward settlement, response mapping, and REST adapters. Daily and Weekly generation share the Player lock so concurrent pool generation cannot overlap definitions. Challenge completion updates the same progression and Player-by-Skill streak state as Standard completion, records per-Skill Challenge bonus components, evaluates the persisted set bonus, and invalidates recommendations in one transaction. No separate Challenge streak exists.

Use database transactions and row locking where appropriate for completion, abandonment, expired clearing, COUNT progress, slot replacement, and Daily/Weekly set bonuses. Use UUID `operation_id` values for action grouping/idempotency.

Standard completion transaction (implementation order):

1. Acquire shared content-library locks and lock the Player row.
2. Reconcile overdue quests, find the current slot, and invalidate the persisted recommendation.
3. Validate accepted status and snapshots; calculate reward shares and bonuses.
4. Create reward records; update Skill progression/streaks and append Skill/Lifetime XP ledger entries.
5. Update overall progression and append its XP ledger entry.
6. Mark the quest completed and record the completion interaction.
7. Select a replacement using updated progression and repoint the same Standard slot.
8. Return authoritative state and commit all changes together.

A late completion returns an expired marker from the transaction, allowing expiration and penalty snapshots to commit, then throws `QUEST_EXPIRED` outside the transaction. Challenge mutations use the same commit-before-error pattern. This path awards no reward and does not apply the stored Standard penalty; clear remains a separate explicit operation.

Any critical failure rolls the complete operation back. Recommendation recalculation may run post-commit; its failure never reverses gameplay. Equivalent transactional designs apply to failure penalties and set bonuses. Never maintain separate “level transaction” records; XP transactions are the immutable ledger and current-state progression tables optimize reads.

## Time and reconciliation

Database instants use PostgreSQL `timestamptz`; Player timezone is an IANA identifier. [Window helpers](../src/modules/challenges/windows.ts) use `Intl.DateTimeFormat` and explicit UTC conversion, not a separate date library. Challenge windows are fixed at creation. Scheduled maintenance and lazy reconciliation share services; the repository supplies a reconciliation command but does not provision an external scheduler.

### Phase 11 jobs and operations

Build 1 uses an externally scheduled, process-to-completion command rather than an in-process timer: `pnpm jobs:reconcile`. The command pages through onboarded Players in bounded batches (50 by default), then uses the same Player-row locks and domain transactions as lazy Standard and Challenge reconciliation. Each Player and subsystem has an independent transaction so one reported failure does not prevent safe work for other Players. Repeated and overlapping runs are safe; database constraints, status predicates, and Player locks make gameplay outcomes idempotent.

Run the command hourly in production. Any platform scheduler capable of executing it is sufficient; local development can invoke it directly from PowerShell. The command requires only `DATABASE_URL`, prints one JSON summary with scan/change/failure counts and elapsed time, and exits nonzero when any per-Player reconciliation failed.

The job expires overdue accepted Standard quests while storing—but never applying—the penalty and leaving slots blocked. It expires unfinished old Challenge quests without penalties or partial XP, creates current fixed-window Daily/Weekly sets when absent, and invalidates a persisted recommendation when lifecycle state changed. It never clears failures, awards XP or set bonuses, advances streaks, generates recommendations, curates content, reseeds data, or performs speculative repair. Request-time lazy checks remain enabled and converge to the same durable state if scheduling is delayed or unavailable.

## Configuration

Centralize and version:

- XP ranges, difficulty bands, and level curves
- Failure penalties and Skill level cap
- Focus total/min/max/modifiers
- Catch-Up XP/recommendation values
- Streak thresholds and bonuses
- Standard/Daily/Weekly difficulty distributions
- Challenge bonus percentages and set bonuses
- Recommendation/history/variety modifiers and windows
- Randomness range
- Reset policy and quest counts
- Allowed completion windows

Configuration versions used by accepted/rewarded quests should be identifiable where necessary for reproducibility. Admin-editable balance configuration is not MVP.

## Canonical seed workflow

Version-controlled repository seed files are canonical and validated before persistence. Stable human-readable identifiers coexist with database primary keys. Seeding upserts definitions and never silently hard-deletes existing QuestDefinitions; removed runtime content is deactivated where appropriate. Direct admin database edits do not automatically rewrite repository files.

## Testing strategy

The [CI workflow](../.github/workflows/ci.yml) runs on pushes and pull requests with Node 24 and a disposable PostgreSQL 17 service. It installs the frozen pnpm lockfile, runs lint/typechecking/unit tests, applies migrations, runs the PostgreSQL integration suite, and builds the application. Integration tests require a disposable database: most suites own random schemas, but the constraint suite truncates public fixture tables. Playwright is a separate local command and is not included in CI.

Require unit tests for pure XP/level/scoring/time calculations; integration tests against PostgreSQL for constraints, locks, transactions, idempotency, and resets; API contract tests for validation and authorization; and Playwright tests for essential desktop/mobile journeys.

Coverage must include XP distribution, lifecycle transitions, deadlines, completion, abandon, expiration/clear, slot replacement, reroll, 🔥, COUNT atomic completion, streaks, timezone resets, recommendation weighting, Challenge generation/bonuses, duplicate requests, and concurrent operations.

## Observability

Implemented evidence includes persisted quest interactions, reward/XP records, admin audit records, and the reconciliation command's JSON summary with counts, elapsed time, and failure stages. Authentication logging omits raw provider metadata. A centralized metrics/tracing pipeline and latency dashboards are not configured in this repository; these remain operational work for a deployment.

## Security and reliability baseline

Enforce authn/authz and resource ownership on the server; validate input at API boundaries; use CSRF-safe Auth.js patterns; do not trust client timestamps, status, rewards, or XP; keep secrets out of source; make important mutations retry-safe; and use database uniqueness/check constraints plus transactional validation as described in [DATA_MODEL.md](DATA_MODEL.md).
