# Engineering competencies demonstrated in FLOURISH

This guide maps engineering decisions to the current implementation and its tests. It describes a local-first modular monolith, not evidence of production scale or a security certification. See the [README](../README.md) for the product and setup, and [architecture](ARCHITECTURE.md) for system boundaries.

## 1. Transaction consistency and concurrency control

**Problem:** concurrent completions, abandonment, and expiration must not overwrite progression or leave rewards and slots in different states.

**Approach and code:** [`standardContext` and `standardTransaction`](../src/modules/quests/standard/context.ts) acquire shared library locks followed by a `SELECT ... FOR UPDATE` lock on the Player. [`resolveStandardQuest`, `complete`, and `applyPenalty`](../src/modules/quests/standard/resolution.ts) perform lifecycle, progression, ledger, and replacement writes inside that transaction. [`mutateChallenge`](../src/modules/challenges/service.ts) uses the same Player-lock convention for Challenge operations.

**Evidence:** [Standard integration tests](../tests/integration/standard-quests.test.ts), especially `Standard Phase 05 concurrency`, exercise double completion, complete-versus-abandon, overlapping Skill rewards, and clear-versus-completion. Other cases inject failures to verify rollback of slot and acceptance writes.

**Tradeoff:** serializing a player's mutations simplifies correctness, but competing actions for that player wait for the same lock. Library locks also coordinate runtime reads with content edits/imports; this is not a claim of unlimited write throughput.

## 2. Idempotent settlement and historical snapshots

**Problem:** duplicate requests must not award twice, and editing a quest definition must not change an already accepted commitment.

**Approach and code:** [`mutateStandardQuest`](../src/modules/quests/standard/actions.ts) stores acceptance-time values and Skill allocations. [`resolveStandardQuest`](../src/modules/quests/standard/resolution.ts) checks status and current-slot ownership before settlement. [`mutateChallenge`](../src/modules/challenges/service.ts) atomically completes COUNT targets and records set bonuses. [`QuestReward`, `QuestSkillReward`, `PlayerQuestSkillSnapshot`, and `ChallengeSet`](../prisma/schema.prisma) retain reward details, snapshots, and bonus state.

**Evidence:** [Standard/Challenge integration tests](../tests/integration/standard-quests.test.ts) cover edited definitions after acceptance, repeated and concurrent completions, COUNT correction/settlement, set bonuses, and late completion rejection. Late Standard completion commits expiration and its penalty snapshot before returning `QUEST_EXPIRED`; tests read the database directly without an intervening Home refresh.

**Tradeoff:** idempotence means no duplicated effect, not identical successful responses on every retry. A repeated terminal Standard action can return `409 QUEST_NOT_CURRENT`. Snapshots and ledger rows increase storage and model complexity; immutability is maintained by application write paths, not a general database prohibition on updates.

## 3. Relational modeling and database invariants

**Problem:** identity, player progression, reusable definitions, assignments, rewards, and audit history have different lifetimes and uniqueness rules.

**Approach and code:** [`prisma/schema.prisma`](../prisma/schema.prisma) separates `User`/`AuthAccount` from `Player`, and `QuestDefinition` from `PlayerQuest`. `PlayerQuestSlot` is unique by player/Skill/slot number; `QuestReward.playerQuestId` is unique. The [initial SQL migration](../prisma/migrations/20260906182309_establish_domain_model/migration.sql) adds CHECK constraints and partial unique indexes such as `quest_skills_one_primary_idx` and `quest_definitions_family_difficulty_key`.

**Evidence:** [database constraint tests](../tests/integration/database-constraints.test.ts) issue SQL directly to exercise invalid states and uniqueness. [Standard tests](../tests/integration/standard-quests.test.ts) verify persistent slot counts and ownership; [seed tests](../tests/integration/canonical-seed.test.ts) verify stable IDs and joins.

**Tradeoff:** invariants span migrations and service validation; Prisma's schema alone is not the complete database contract. Cross-row allocation totals are validated by application code. Historical references favor deactivation over deletion, which preserves evidence but requires explicit content lifecycle management.

## 4. Authentication, authorization, and API boundaries

**Problem:** browser-supplied identity, role, XP, or lifecycle state must not control another player's records or administrative actions.

**Approach and code:** [`authOptions`](../src/modules/auth/options.ts) configures Google-only sign-in, verified-email checks, JWT sessions containing a persisted user identifier, and database-backed session identity/role lookup. [`flourishAdapter`](../src/modules/auth/adapter.ts) maps provider accounts without persisting Google access/refresh tokens or silently changing an account's owner. [`requireCompletedOnboardingPlayer` and `requireAdmin`](../src/modules/auth/guards.ts) enforce access. [`createStandardApi`](../src/modules/quests/standard/api.ts) and [`createAdminApi`](../src/modules/admin/api.ts) resolve principals before calling services; [`payload` and `respond`](../src/lib/api.ts) enforce same-origin JSON mutations and map validation/service failures to responses.

**Evidence:** [onboarding/API integration tests](../tests/integration/player-onboarding.test.ts) exercise identity, session-adapter ownership, onboarding, and forged inputs. [Standard REST tests](../tests/integration/standard-quests.test.ts) cover wrong origins and cross-player access. [Admin tests](../tests/integration/admin-curation.test.ts) deny anonymous and non-admin operations.

**Tradeoff:** Google is the only supported provider; provider consent/callback verification remains a manual configuration check. Sessions last seven days and do not have a server-side JWT revocation list. These concrete controls do not substitute for a broader production security assessment.

## 5. Deterministic algorithms and explicit time boundaries

**Problem:** distributing integer XP across Skills must conserve totals, level boundaries must agree everywhere, and daily/weekly windows must respect player timezones.

**Approach and code:** [`allocateLargestRemainder` and `percentRoundHalfUp`](../src/modules/progression/math.ts) define allocation and rounding, including stable tie-breaking. [`skillLevelForXp` and `overallLevelForXp`](../src/modules/progression/levels.ts) use configured curves and binary search. [`localDate`, `advanceStreak`, and `mondayWeekStart`](../src/modules/progression/streaks.ts), plus [`localMidnightUtc` and `challengeWindow`](../src/modules/challenges/windows.ts), use explicit dates and IANA timezones. Balance values live in [`gameConfig`](../src/config/game.ts).

**Evidence:** [progression tests](../tests/unit/progression.test.ts) exercise integer conservation, rounding, level boundaries, and streak rules; [Challenge tests](../tests/unit/challenge-engine.test.ts) cover window calculation, including DST. [Integration tests](../tests/integration/standard-quests.test.ts) inject `now` for deadline/reconciliation scenarios.

**Tradeoff:** arithmetic is restricted to safe integers. Timezone conversion uses `Intl.DateTimeFormat` and explicit helper functions rather than a separate date library. Fixed-window Challenge timestamps preserve historical meaning when a player later changes timezone.

## 6. Explainable recommendation and selection logic

**Problem:** suggest useful, varied quests without inventing extra assignments or changing rewards based on preference settings.

**Approach and code:** [`scoreRecommendation`, `historyModifier`, and `reasonCodes`](../src/modules/recommendations/scoring.ts) calculate configured factors and user-facing reasons. [`getHomeRecommendation`](../src/modules/recommendations/service.ts) selects only eligible available Standard slots and persists the result until invalidated. [`selectCandidate`](../src/modules/quests/standard/selection.ts) handles assignment eligibility and weighted selection; random sources are injected for testing.

**Evidence:** [recommendation scoring tests](../tests/unit/recommendation-scoring.test.ts), [selection tests](../tests/unit/standard-selection.test.ts), and the `Home recommendations` cases in [integration tests](../tests/integration/standard-quests.test.ts) cover ranking factors, repeat avoidance, persistence, invalidation, and concurrent refreshes.

**Tradeoff:** this is configurable rule-based personalization. Bounded randomness offers variety, while persistence prevents a reload from continually changing the suggestion. It depends on curated metadata and explicit weights rather than learned user models.

## 7. Content administration and repeatable data imports

**Problem:** curators need to edit and approve content without erasing player history; repository seed updates need to be repeatable and distinguish seed-owned from admin-owned records.

**Approach and code:** [`createQuest`, `updateQuest`, and `transitionQuest`](../src/modules/admin/service.ts) combine schema/reference validation, serializable transactions with bounded retries, timestamp-based stale-edit checks, review transitions, and before/after audit records. [`persistCanonicalSeed`](../src/modules/quests/seed/persist.ts) validates first, acquires an advisory lock and content-table locks, upserts stable keys, reconciles joins, and deactivates removed seed-managed content.

**Evidence:** [admin curation tests](../tests/integration/admin-curation.test.ts) cover audit records, role checks, stale edits, review eligibility, and family-tier races. [canonical seed tests](../tests/integration/canonical-seed.test.ts) cover repeated imports, deactivation/reactivation, ownership collisions, concurrent imports, and late-failure rollback.

**Tradeoff:** database curation does not rewrite repository seed files. A later seed import can restore canonical values, so curators need the documented [content workflow](QUEST_CONTENT_GUIDE.md). Broad import locks prioritize consistency during an operational import over concurrent content writes.

## 8. Layered verification and recoverable operation

**Problem:** pure logic tests cannot establish PostgreSQL transaction behavior, while browser-only tests make failures harder to isolate.

**Approach and code:** [Vitest unit configuration](../vitest.config.ts) runs domain/component tests; [integration configuration](../vitest.integration.config.ts) runs database files serially. [Playwright configuration](../playwright.config.ts) defines desktop and phone-view Chromium projects with a separate test server. [`runGameStateReconciliation`](../src/modules/jobs/reconciliation.ts) processes players in batches, reuses lifecycle services, and reports per-stage failures. [CI](../.github/workflows/ci.yml) provisions disposable PostgreSQL, migrates it, and runs lint, typechecking, unit/integration tests, and a production build.

**Evidence:** [Home loading tests](../tests/unit/player-home.test.tsx) verify safe handling of each service failure and propagation of unexpected failures. [Home interaction tests](../tests/unit/standard-quests-ui.test.tsx) verify authoritative progression refresh after Challenge settlement. [Scheduled reconciliation integration cases](../tests/integration/standard-quests.test.ts) test repeat and overlapping runs without hidden XP/penalty changes. [Browser journeys](../tests/e2e/) cover onboarding through gameplay and admin curation.

**Tradeoff:** browser tests require a separately migrated/seeded disposable database and skip authenticated cases when it is absent; they are not in the current CI workflow. The reconciliation command needs an external scheduler for unattended operation. Automated passing checks demonstrate covered behavior, not deployment availability or load capacity.
