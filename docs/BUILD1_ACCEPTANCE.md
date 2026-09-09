# Build 1 Acceptance Criteria

Status: authoritative release gate. Behavior details are in [game rules](GAME_RULES.md), [data model](DATA_MODEL.md), and [architecture](ARCHITECTURE.md).

## End-to-end player capability

A fresh environment with canonical version-controlled seed/config data supports a new player who can:

- [x] Sign in using Google OAuth and receive/create a separate Player profile.
- [x] select a valid IANA timezone, allocate exactly 46 Focus Points with 1–10 per skill, and complete onboarding.
- [x] receive exactly 24 persistent Standard Quest slots: three for each FLOURISH skill.
- [x] reload/return later without regeneration or loss of game state.
- [x] reroll an AVAILABLE Standard quest and receive a persisted replacement with interaction history.
- [x] use 🔥 when an approved active higher family variant exists, including a missing-tier skip.
- [x] accept a Standard quest and receive its accepted snapshots and 24/48/72-hour deadline.
- [x] complete it and immediately receive correct Overall XP, largest-remainder distributed Skill XP, Lifetime Skill XP, applicable +10% Catch-Up XP, post-current-day streak bonus, immutable ledger rows, and a replacement in the same slot.
- [x] accept and abandon another quest, immediately receive only the configured Current Skill XP penalty, and receive a replacement.
- [x] let an accepted Standard quest expire, see its stored unapplied penalty and blocked slot, and incur no penalty merely by loading the application.
- [x] clear the expired quest, apply its stored penalty once, and receive a replacement.
- [x] see a persisted Home recommendation selected only from existing AVAILABLE Standard slots, with safe reason chips and no 25th quest.
- [x] receive three Daily Challenges in unique skills and five Weekly Challenges in unique skills, with no simultaneous same-definition overlap across the two pools.
- [x] explicitly accept and complete SINGLE Challenges.
- [x] increment/decrement accepted COUNT Challenges and automatically complete atomically at target without partial XP.
- [x] receive +10% Daily / +15% Weekly individual Challenge bonuses and +100 / +300 Overall-only full-set bonuses exactly once via persisted Challenge set/window state.
- [x] build Skill streaks using local calendar-day boundaries, including every rewarded skill on a multi-skill completion.
- [x] freely respec all Focus Points with history recorded and only future recommendation/selection affected.
- [x] use all critical workflows at desktop and phone-sized responsive layouts without hover-only controls.

## Admin capability

An authorized administrator can list/search/filter, create/edit/validate, submit, approve/reject, activate/deactivate QuestDefinitions, and inspect family progressions. Unauthorized users cannot use admin capabilities. Gameplay-relevant edits return approved content to review. Runtime never selects content lacking both APPROVED state and ACTIVE state. Important curator actions are auditable.

## Reliability and concurrency gates

- [x] Duplicate completion cannot duplicate rewards or XP.
- [x] Duplicate abandonment cannot duplicate a penalty.
- [x] Expired clear cannot apply a stored penalty twice.
- [x] Concurrent COUNT target updates cannot reward twice or exceed the target.
- [x] Daily/Weekly set bonuses cannot award twice.
- [x] Concurrent slot replacement cannot create conflicting current quests.
- [x] Completion versus abandonment/expiration races resolve to one valid terminal path.
- [x] Critical transaction failure leaves no partial quest, reward, XP, level, streak, bonus, or slot state.
- [x] Lazy reset reconciliation produces the same durable state as scheduled reconciliation and is retry-safe.
- [x] Recommendation calculation failure does not roll back committed gameplay.

## Automated verification expectations

Unit, integration, API, and end-to-end tests cover the workflows above. At minimum test boundary XP values, all reward splits after the rounding decision is resolved, every status transition, timezone/DST boundaries, all streak tiers, every level band, all feedback modifiers, eligibility filtering, family-tier skipping, and invalid/duplicate/concurrent requests.

The Overall and Skill XP level curves are resolved in Phase 05 and documented in GAME_RULES.md; no level-curve OPEN DECISION remains.

## Phase 03 verification scope

Phase 03 implements Google-only Auth.js wiring, idempotent Player creation, explicit timezone confirmation, the complete 46-point allocation, transactional onboarding, initial progression/streak rows, Focus history/respec, timezone Settings, and server-side User/Player/admin guards. Unit/component and PostgreSQL tests exercise these boundaries without Google. Browser smoke coverage uses genuine Auth.js encrypted cookies minted by test-only fixture code, including reload persistence, completed-onboarding redirects, respec, timezone changes, admin denial/allowance, and sign-out on desktop/phone.

The Google provider, verified-email requirement, callback/session behavior, and one-User/one-Player mapping are implemented. Automated acceptance uses normal encrypted Auth.js sessions rather than an application bypass; a live Google consent round trip remains a deployment-configuration check because tests intentionally do not depend on Google's external service.

## Phase 04 verification scope

Phase 04 implements lazy/idempotent creation of exactly 24 persistent Standard slots, eligible weighted assignment, repeat suppression, invalid AVAILABLE reconciliation, acceptance snapshots and exact elapsed deadlines, free rerolls with optional feedback, and next-higher family upgrades. PostgreSQL tests cover ownership, atomic rollback, duplicate avoidance, accepted/expired blocking, idempotent acceptance, and competing accept/reroll/upgrade requests. Browser coverage exercises the same Home controls at desktop and phone widths using ordinary encrypted Auth.js test sessions.

The Standard slot, persistence, reroll, upgrade, and acceptance items above are implemented and automated. Their release checkboxes remain part of the full end-to-end gate until live Google setup and later-phase completion/refill flows are verified together. Phase 04 deliberately does not auto-expire accepted quests, resolve completion/failure, award XP, update levels/streaks, generate Challenges, or produce Home recommendations.

## Phase 07 verification scope

Phase 07 completes and verifies the Skill-level streak system established by Phase 05: local-calendar qualification, same-day suppression, resets after gaps, post-completion bonus tiers, independent multi-Skill advancement, effective stale reads, timezone/DST boundaries, transactional concurrency, and restrained Home visibility. Monday-based local-week calculation is available for Phase 08; no Standard quest advances a weekly Challenge streak and no Challenge behavior is implemented early.

## Phase 08 verification scope

Phase 08 implements persisted Daily and Weekly Challenge windows, constrained non-overlapping selection, explicit acceptance, SINGLE completion, atomic COUNT correction/completion, no-penalty expiration, distributed Challenge/Catch-Up/streak rewards, and Overall-only set bonuses. Challenge completion advances only the existing Player-by-Skill streak rows. Lazy reconciliation provides the same correctness boundary required by future scheduled maintenance without adding cron infrastructure.

## Phase 12 acceptance closure

Phase 12 closes the Build 1 release gate with a protected Profile/Progress surface, product-correct mobile Profile navigation, deterministic browser synchronization around Standard lifecycle mutations, and synchronized setup/operations documentation. Full unit, PostgreSQL integration/concurrency, fresh-database migration/seed, reconciliation, production-build, and authenticated desktop/Pixel 7 Playwright verification establish the checked criteria above. External Google consent availability remains an environment/deployment concern rather than an application acceptance blocker.
