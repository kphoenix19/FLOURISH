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

## Atomic gameplay operations

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
