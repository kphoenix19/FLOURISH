# Architecture

Status: authoritative Build 1 technical direction. Product behavior remains governed by [PRODUCT_SPEC.md](PRODUCT_SPEC.md) and [GAME_RULES.md](GAME_RULES.md).

## System shape

- Responsive browser application
- Next.js, React, TypeScript
- Modular monolith
- REST API as the official application boundary
- PostgreSQL with Prisma or equivalent open-source ORM
- Auth.js with Google OAuth only for Build 1
- Docker Compose, local-first development
- Server-authoritative gameplay
- Version-controlled configuration and seed data

Likely tools: pnpm, Tailwind CSS, shadcn/ui, Zod, Vitest, React Testing Library, Playwright, and GitHub Actions. These are preferred implementation details, not product contracts. Do not introduce microservices for MVP.

Future web/mobile clients must be able to reuse the REST boundary. Server Actions may support isolated web-only behavior but must not be the sole authoritative interface for core gameplay.

## Conceptual modules

`auth`, `player`, `flourish`, `quests`, `progression`, `streaks`, `challenges`, `recommendations`, `admin`.

Modules may share one deployable and database while exposing explicit services and ownership. Avoid circular domain ownership. Core transitions should enter through application services invoked by REST handlers, jobs, and lazy reconciliation paths.

## Authentication boundary

Keep `User` and provider `AuthAccount` identity separate from `Player` game state. MVP is one User to one Player without unnecessarily blocking future expansion. Named environment placeholders may include `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, and `DATABASE_URL`; real values belong only in ignored local environment files.

Build 1 User roles are `PLAYER` and `ADMIN`. Both `/admin` and admin mutation endpoints enforce `ADMIN` authorization on the server.

### Phase 03 implementation

Auth.js uses stable `next-auth` 4.24.15 (whose peer range includes Next.js 16), the App Router auth handler, and `getServerSession`. The installed handler awaits Next.js request headers, cookies, and route params. Google is the only provider, and sign-in requires a verified Google email. A custom adapter maps the existing User/AuthAccount models, creates the User and initial Player together, and does not retain Google tokens. Email is trimmed/lowercased without Gmail dot/plus rewriting. Auth.js safe account-linking behavior remains enabled: matching email alone does not merge identities; account-owner collisions fail. Concurrent initial creation can safely fail one competing OAuth attempt rather than claim an existing identity.

Encrypted, HTTP-only JWT sessions contain persisted User identity, not gameplay state or provider credentials. Server session resolution reads current email, role, Player ID, and onboarding timestamp from PostgreSQL; role changes take effect on the next protected request. Sign-out clears the browser session; this phase has no server-side JWT revocation list. `AUTH_SECRET` rotation invalidates existing tokens. Session lifetime is seven days; no production test-auth bypass exists.

`src/modules/auth/` owns configuration, adapter mapping, session resolution, and reusable User/Player/completed-onboarding/admin guards. `src/modules/player/services.ts` owns bootstrap, onboarding, respec, timezone, and integrity services. `src/modules/player/api.ts` supplies thin, dependency-injected REST handlers; the production composition obtains identity only from the verified session. `/api/me`, `/api/onboarding/complete`, `/api/me/focus`, `/api/me/timezone`, and the read-only `/api/admin` guard probe return JSON and `Cache-Control: no-store`. Future admin mutations must call the same server-side guard; no curation mutations exist in this phase.

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

Phase 07 reuses the Phase 05 completion transaction as the sole authoritative Skill-streak write path. Player-facing reads derive an effective streak from the stored local qualifying date without writing merely because time passed, and expose active state plus progress toward the next configured bonus tier. Calendar helpers use the Player's IANA timezone; a Monday-based local-week helper establishes the boundary needed by Phase 08, while weekly Challenge-driven streak advancement remains deferred until that engine exists.

Use database transactions and row locking where appropriate for completion, abandonment, expired clearing, COUNT progress, slot replacement, and Daily/Weekly set bonuses. Use UUID `operation_id` values for action grouping/idempotency.

Completion transaction:

1. Lock PlayerQuest and relevant slot/progress rows.
2. Validate `ACCEPTED`, unresolved status, request idempotency, and deadline reconciliation.
3. Calculate reward from accepted snapshots and configured rules.
4. Mark `COMPLETED`.
5. Create QuestReward and QuestSkillReward rows.
6. Append XP transactions.
7. Update PlayerProgress and PlayerSkillProgress; derive levels.
8. Update qualifying skill streaks.
9. Clear Standard slot if applicable.
10. Select and assign its replacement Standard quest.
11. Invalidate the current Home recommendation.
12. Commit.

Any critical failure rolls the complete operation back. Recommendation recalculation may run post-commit; its failure never reverses gameplay. Equivalent transactional designs apply to failure penalties and set bonuses. Never maintain separate “level transaction” records; XP transactions are the immutable ledger and current-state progression tables optimize reads.

## Time and reconciliation

Store database instants in UTC and Player timezone as IANA identity. Compute local daily/weekly boundaries with a timezone-aware library. Challenge windows are fixed at creation. Use both scheduled maintenance and defensive lazy reconciliation in relevant requests; cron is an optimization, not the sole correctness mechanism.

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

Require unit tests for pure XP/level/scoring/time calculations; integration tests against PostgreSQL for constraints, locks, transactions, idempotency, and resets; API contract tests for validation and authorization; and Playwright tests for essential desktop/mobile journeys.

Coverage must include XP distribution, lifecycle transitions, deadlines, completion, abandon, expiration/clear, slot replacement, reroll, 🔥, COUNT atomic completion, streaks, timezone resets, recommendation weighting, Challenge generation/bonuses, duplicate requests, and concurrent operations.

## Observability

Record structured events/metrics for lifecycle transitions, XP operations, scheduled job failures, state-invariant violations, lazy reconciliation latency, and internal recommendation factors. Do not expose coefficients to players or store unlimited verbose operational logs in PostgreSQL. Avoid sensitive data in logs.

## Security and reliability baseline

Enforce authn/authz and resource ownership on the server; validate input at API boundaries; use CSRF-safe Auth.js patterns; do not trust client timestamps, status, rewards, or XP; keep secrets out of source; make important mutations retry-safe; and use database uniqueness/check constraints plus transactional validation as described in [DATA_MODEL.md](DATA_MODEL.md).
