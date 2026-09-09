# FLOURISH — Build 1 Documentation

Status: completed Build 1 baseline and freeze document. This is the consolidated human-readable record of what Build 1 shipped and the handoff baseline for Build 2 planning.

## How to use this document

This document summarizes the completed system across the product specifications, game rules, data model, architecture, acceptance record, curated content, implementation, and tests. It is intended to let a future developer or AI coding session understand Build 1 without reconstructing Phases 00A–12.

It does not replace the specialized contracts. [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [GAME_RULES.md](GAME_RULES.md), [DATA_MODEL.md](DATA_MODEL.md), [RECOMMENDATION_ENGINE.md](RECOMMENDATION_ENGINE.md), [QUEST_CONTENT_GUIDE.md](QUEST_CONTENT_GUIDE.md), [ADMIN_SPEC.md](ADMIN_SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), [BUILD1_ACCEPTANCE.md](BUILD1_ACCEPTANCE.md), and [BACKLOG.md](BACKLOG.md) remain authoritative for their subjects. If documentation conflicts with code, the shipped implementation is authoritative as evidence of what Build 1 actually does; the discrepancy should then be resolved in the appropriate specialized document.

This file is a historical snapshot. Build 2 work should update the appropriate current canonical documents and create explicit migrations or decisions where needed, not silently rewrite this Build 1 baseline into proposed behavior. Everything before the Deferred Backlog section describes shipped Build 1 behavior. Later sections clearly label possibilities and unresolved design work; they are not approved features.

## Product identity and philosophy

FLOURISH is a browser-based, gamified real-life progression system. Its defining statement is:

> Your real life is the game. FLOURISH is the progression system.

The product rewards constructive real-life actions that may otherwise provide little immediate feedback. A player accepts curated quests, completes the corresponding action in real life, self-reports completion on the honor system, and sees progress across an overall character and eight life Skills.

FLOURISH is not a conventional to-do list. Build 1 deliberately avoids pay-to-win mechanics, completion verification, outcome-based rewards, and runtime AI content generation. It rewards actions within the player's control rather than wealth, status, health outcomes, or other external results. Curated semantic variety matters more than superficial wording changes.

The server is authoritative for gameplay. Focus and Catch-Up shape suggestions without excluding entire areas of life. XP values express the value and importance of an action, not merely its duration. Ordinary selection always comes from an approved, active, version-controlled or admin-curated Quest Library.

## FLOURISH Skills

The name FLOURISH encodes the complete Build 1 taxonomy. Skill trees and subskills did not ship.

| Code | Skill | Scope |
|---|---|---|
| F | Fitness | Physical health and fitness |
| L | Learning | Learning and upskilling |
| O | Occupation | Career and work |
| U | Us | Relationships and social connection |
| R | Reflection | Mindfulness, spirituality, religion, contemplation, and intentional rest |
| I | Investing | Finances and investing |
| S | Stewardship | Cooking, cleaning, organization, and care for the home |
| H | Hobbies | Fun, recreation, creativity, and personal interests |

All eight Skills are canonical seeded records with stable one-character codes and sort order. Each has independent current and lifetime XP, level, Focus allocation, and streak state. Multi-Skill quests can reward up to three Skills, but exactly one Skill is primary.

## Player and account model

Build 1 supports Google OAuth only through Auth.js/NextAuth.js 4.24.15. A verified Google email is required. Identity and game state are intentionally separate:

- `User` is authentication identity and carries the `PLAYER` or `ADMIN` role.
- `AuthAccount` links the Google provider account. Provider access, refresh, and ID tokens are not stored because Build 1 calls no Google APIs.
- `Player` is the one-to-one gameplay profile, with timezone and onboarding state.

The custom adapter creates the User and initial Player together and safely reuses linked accounts. Emails are trimmed and lowercased but are not rewritten with Gmail dot or plus rules. Matching email addresses do not automatically merge different provider identities; account-link collisions require administrator investigation.

Sessions are encrypted HTTP-only JWTs with a seven-day lifetime. They hold persisted User identity, not gameplay state or provider credentials. Each protected server request reloads the current email, role, Player ID, and onboarding state from PostgreSQL, so role changes take effect on the next request. Build 1 has no server-side JWT revocation list; rotating `AUTH_SECRET` invalidates sessions.

First sign-in creates an incomplete Player. Onboarding requires an explicit valid IANA timezone and a complete Focus allocation. In one locked transaction it writes all eight current Focus rows and initialization history rows, initializes missing overall/Skill progress and Skill streaks, and marks onboarding complete. It does not generate quests. A matching retry is idempotently successful; a retry with different completed values returns a conflict and directs the player to Settings. Partial pre-onboarding state is reported for repair instead of silently fabricated.

The server derives User, Player, ownership, and admin role from the session. Browser mutations require same-origin JSON and strict request schemas; clients cannot supply trusted identity or role fields.

## Focus system

Every onboarded player allocates exactly 46 Focus Points across all eight Skills, with 1–10 points per Skill. The balanced default is `6/6/6/6/6/6/5/5`; balanced and min-max allocations are both valid.

Focus affects future quest-selection and Home-recommendation weighting only. It does not change XP, levels, failure penalties, streaks, slot counts, or hard eligibility. It never rewrites an accepted quest or historical reward.

| Focus Points | Modifier | Focus Points | Modifier |
|---:|---:|---:|---:|
| 1 | 0.70 | 6 | 1.10 |
| 2 | 0.75 | 7 | 1.20 |
| 3 | 0.80 | 8 | 1.30 |
| 4 | 0.90 | 9 | 1.40 |
| 5 | 1.00 | 10 | 1.50 |

For a multi-Skill quest, the Focus modifier is the reward-percentage-weighted arithmetic mean of the relevant Skill modifiers. Respecs are free and unlimited. A respec is serialized by locking the Player, writes only changed Skills to history under one allocation-change UUID, and records nothing for a no-op. The initial history has one row per Skill with a null old value. Timezone changes are separate and do not rewrite Focus history.

## Quest model and lifecycle

### Curated definitions

A `QuestDefinition` describes the reusable activity: stable identity, title and description, difficulty, Base XP, estimated active minutes, completion window, `SINGLE` or `COUNT` completion, pool eligibility, Skill reward allocation, variety/context tags, optional family, curation and safety metadata, review state, and active state.

Runtime eligibility always requires both `APPROVED` review state and `ACTIVE` state plus eligibility for the requested pool. The engine returns a visible domain failure if no eligible definition exists; it never invents content.

A quest has exactly one primary Skill, at most two secondary Skills, one to three rewarded Skills total, and reward percentages totaling 100%. It has one to three Variety Tags with exactly one primary tag. A `QuestFamily` groups natural difficulty variants and permits at most one definition per difficulty; membership is optional and tiers may be missing.

Build 1 ships a canonical version-controlled library of 8 Skills, 76 Variety Tags, 15 families, and 275 definitions: 34 Fitness, 33 Learning, 36 Occupation, 34 Us, 34 Reflection, 34 Investing, 35 Stewardship, and 35 Hobbies. It contains 246 `SINGLE` and 29 `COUNT` definitions, 233 single-Skill and 42 two-Skill definitions, and no forced three-Skill quests. Pool eligibility counts are 246 Standard, 157 Daily, and 193 Weekly; eligibility may overlap.

### Runtime quests and snapshots

A `PlayerQuest` is an assigned instance in the `STANDARD`, `DAILY`, or `WEEKLY` pool. It holds lifecycle timestamps, progress, fixed Challenge-window identity where applicable, and gameplay snapshots. An accepted quest freezes difficulty, Base XP, completion type and target, Standard completion window, rewarded Skills and percentages, title, description, estimated minutes, and reward-affecting inputs. Later definition edits cannot alter the player's accepted promise.

Interactions are append-only history. Build 1 records assignment/shown, acceptance, completion, reroll and feedback, upgrade, abandonment, expiration, and clear-related signals needed for audit and recommendations. Terminal quest history is retained rather than overwritten.

### Standard slots

Every onboarded player has exactly three persistent Standard slots for each of the eight Skills: 24 total. Slots are created and filled lazily on first Standard-state access under a Player lock. Reloading preserves assignments. Reconciliation retains valid `AVAILABLE`, `ACCEPTED`, and uncleared `EXPIRED` occupants; it replaces invalid available content or an unexpected terminal occupant. Focus changes do not regenerate existing offers.

An `AVAILABLE` Standard quest has no active deadline and never auto-expires. The player may:

- accept it, starting its exact 24-, 48-, or 72-hour elapsed deadline;
- reroll it for free and without limit, optionally giving `TOO_HARD`, `NO_TIME`, `NOT_INTERESTED`, or `JUST_DIFFERENT` feedback; or
- request the next approved, active, Standard-eligible harder member of the same family, skipping missing tiers, when that member has the same primary Skill.

Reroll and harder-family replacement keep the same slot, preserve the old instance as terminal history, record an interaction, and atomically point the slot to the replacement. A rerolled definition is excluded from the immediate selection context but is not permanently banned. The harder action carries no extra durable negative recommendation modifier.

The Standard lifecycle is:

```text
AVAILABLE --accept--> ACCEPTED --complete--> COMPLETED
                              --abandon----> ABANDONED
                              --deadline----> EXPIRED --clear--> penalty applied and cleared
```

Completion atomically grants rewards, updates progression and Skill streaks, records immutable ledger facts, and refills the same slot. It is terminal and cannot be undone.

Abandonment is immediate acknowledged failure. It atomically applies the configured Current Skill XP penalty, preserves Overall and Lifetime Skill XP, and refills the slot.

Passing a deadline changes an accepted quest to `EXPIRED`, calculates and stores its unapplied per-Skill penalty, and leaves it blocking the slot. Merely opening the application never applies the penalty. The player may leave it uncleared indefinitely at the cost of that slot. Explicit clear applies the stored penalty once, records intended and actual amounts, and refills the slot.

The failure penalty is 20% of snapshotted Base XP. Multi-Skill penalties follow the snapshotted reward allocation. Only Current Skill XP decreases and every balance is clamped at zero; Overall XP and Lifetime Skill XP never decrease. Actual applied penalty may therefore be smaller than intended.

## XP and progression

### Core invariants

- Overall XP is monotonically increasing and Overall Level is effectively uncapped.
- Current Skill XP can increase or decrease but never falls below zero.
- Lifetime Skill XP is monotonically increasing.
- Skill Level is derived from Current Skill XP, can rise or fall, and is capped at 100.
- Current Skill XP may continue accumulating beyond the level-100 threshold.
- All eight Skills share one Skill curve; Overall progression uses a slower curve.
- XP is distributed across rewarded Skills, never duplicated. The sum of final Skill rewards plus any Overall-only set bonus reconciles to Overall XP.
- Progress caches reconcile to immutable XP ledger effects.

For transition from level `L` to `L + 1`:

```text
Skill XP required   = 100 + 20(L - 1) + 2(L - 1)^2
Overall XP required = 200 + 35(L - 1) + 3(L - 1)^2
```

Cumulative XP is the exact integer sum of all earlier transitions.

| Level | Skill cumulative XP | Overall cumulative XP |
|---:|---:|---:|
| 2 | 100 | 200 |
| 5 | 548 | 1,052 |
| 10 | 2,028 | 3,672 |
| 25 | 16,568 | 27,432 |
| 50 | 104,468 | 165,032 |
| 75 | 326,118 | 506,382 |
| 100 | 744,018 | 1,145,232 |

Base XP ranges from 50 to 1000 in these configured bands:

| Difficulty | Base XP |
|---|---:|
| Easy | 50–99 |
| Medium | 100–249 |
| Hard | 250–499 |
| Epic | 500–749 |
| Legendary | 750–1000 |

### Allocation and bonuses

Integer XP percentage calculations use round-half-up: `floor((amount × percent + 50) / 100)`. Whenever a total is distributed across percentage shares, Build 1 uses deterministic largest-remainder allocation: floor proportional shares, assign leftover units by descending fractional remainder, and resolve ties by ascending FLOURISH Skill code. Distributed amounts therefore reconcile exactly.

The single lowest Skill is ranked by Current Skill Level, then Current Skill XP, then ascending Skill code. If that Skill is rewarded by a completed quest, it receives a 10% Catch-Up bonus calculated from its distributed Base Skill XP. Streak bonus is also calculated from Base Skill XP, independently for each rewarded Skill. Catch-Up and streak bonuses stack additively; streak is not applied to Catch-Up-enhanced XP. Challenge percentage bonuses are recorded as a separate auditable component.

For a completed quest, `QuestReward` stores the operation, Base XP and total bonus components; `QuestSkillReward` records the immutable per-Skill percentages and Base, Catch-Up, streak, Challenge, and final Skill XP; `XpTransaction` stores the signed Overall, Skill Current, and Skill Lifetime ledger effects. Database uniqueness and operation IDs make settlement idempotent.

## Streak system

Streaks belong to Skills, not quests or Challenge sets. Completing at least one accepted Standard, Daily, or Weekly quest that rewards a Skill qualifies that Skill for the player's local calendar day. A multi-Skill completion qualifies every rewarded Skill. Multiple completions for the same Skill on the same local day count once. Rerolls, abandonment, and expiration do not qualify.

Consecutive local dates extend a streak; a missed local calendar day resets it. There is no Build 1 grace period or freeze. Reads calculate an effective inactive/reset state without requiring a write merely because time passed. `current_days`, `longest_days`, and the last qualifying local date are persisted.

The bonus tier is evaluated after counting the current qualifying day, so the completion that establishes day 3 receives 5%:

| Resulting streak | Bonus on Base Skill XP |
|---:|---:|
| 0–2 days | 0% |
| 3–6 days | 5% |
| 7–13 days | 10% |
| 14–29 days | 15% |
| 30+ days | 20% |

The UI shows current/effective and longest streaks, whether the streak is active, the current bonus, and progress to the next tier. Build 1 has no separate Daily- or Weekly-Challenge streak, and completing a set does not advance an extra streak.

## Recommendation engine

Build 1 contains two related weighted-random decisions:

1. **Quest Generation Score** selects curated content to fill a Standard slot, with full difficulty influence.
2. **Home Recommendation Score** selects one already-existing `AVAILABLE` Standard slot, with light difficulty influence. It never creates a 25th quest.

Both use the multiplicative model:

```text
Score = DifficultyWeight
      × FocusModifier
      × CatchUpModifier
      × VarietyModifier
      × HistoryModifier
      × RandomnessModifier

P(quest i) = Score(i) / sum(all eligible scores)
```

Eligibility filtering occurs before scoring. Focus and recommendation Catch-Up are reward-percentage-weighted for multi-Skill quests and multiply each other; neither is a hard exclusion. Recommendation Catch-Up ranks the lowest three Skills at 1.30, 1.20, and 1.10, with all others at 1.00.

Standard generation difficulty distributions by slot-Skill level are:

| Skill level | Easy | Medium | Hard | Epic | Legendary |
|---|---:|---:|---:|---:|---:|
| 1–10 | 60 | 25 | 10 | 4 | 1 |
| 11–25 | 45 | 30 | 17 | 7 | 1 |
| 26–50 | 30 | 30 | 25 | 12 | 3 |
| 51–75 | 20 | 25 | 30 | 20 | 5 |
| 76–100 | 15 | 20 | 30 | 25 | 10 |

There is no forced Easy slot and difficulty is weighted, not level-gated. For Home scoring, the highest-weight tier for the Skill level is an appropriate match at 1.00; adjacent tiers use 0.95; tiers two or more positions away use 0.85.

Variety looks at the primary Variety Tag among the last five completed activities in the relevant Skill. Zero through five occurrences use modifiers `1.00, 0.95, 0.90, 0.85, 0.80, 0.75`.

History considers approximately the 20 most recent relevant interactions. Similarity means the same FLOURISH Skill and primary Variety Tag; Build 1 uses no embeddings or semantic AI. Initial signals include recent similar completion 0.95, generic reroll 0.90, `JUST_DIFFERENT` 0.98, `NO_TIME` 0.90, `TOO_HARD` 0.85, `NOT_INTERESTED` 0.75, similar abandonment 0.85, and similar expiration 0.90. When several recent signals apply, the strongest/lowest modifier wins rather than compounding. `NO_TIME` affects candidates at least as long as its source quest; `TOO_HARD` affects candidates at least as difficult.

The random multiplier is bounded from 0.90 to 1.10. Production performs weighted selection rather than always taking the maximum score; tests can inject deterministic randomness.

The Home recommendation is persisted in `PlayerRecommendation` with the selected PlayerQuest, safe reason codes, calculation/invalidation timestamps, and configuration version. It remains stable until a meaningful state change such as acceptance, reroll, expiration, replacement, completion, Challenge reset, or Focus respec invalidates it. Recalculation is non-critical: failure may leave no current recommendation but never rolls back committed gameplay. Player-facing reasons are limited to safe explanations such as “Matches your Focus,” “Skill needs attention,” “Something different,” and “Matches your experience”; raw coefficients are not exposed.

## Daily, Weekly, and COUNT Challenges

Daily and Weekly Challenges are independent persisted pools with explicit acceptance, fixed UTC windows derived from the Player's IANA timezone, no rerolls, and no failure penalties. The same QuestDefinition cannot be simultaneously active in both pools for one player. Legendary definitions are excluded.

| Pool | Quests | Unique Skills | Difficulty weights E/M/H/Epic/Legendary | Individual bonus | Full-set bonus | Reset |
|---|---:|---:|---|---:|---:|---|
| Daily | 3 | 3 | 60/30/8/2/0 | +10% | +100 Overall XP | Local midnight |
| Weekly | 5 | 5 | 30/40/25/5/0 | +15% | +300 Overall XP | Monday local midnight |

Selection uses Focus, Catch-Up, variety, history, and bounded randomness while enforcing unique primary Skills and cross-pool definition exclusion. A persisted `ChallengeSet` owns the pool/window and exactly-once set-bonus state. Changing timezone affects future sets and streak boundaries but never changes an existing fixed Challenge window or Standard deadline.

Unfinished available or accepted Challenges become `EXPIRED` at window reset without penalty or partial XP. Their acceptance and progress history remain. Completing a Challenge awards its distributed Base XP, Catch-Up bonus, per-Skill streak bonus, and configured individual Challenge bonus through the same progression and ledger system as Standard quests. Completing every quest in the set atomically grants the Overall-only set bonus once.

`SINGLE` quests have target 1 and complete through an explicit action after acceptance. `COUNT` quests have a target greater than 1. Once accepted, the player may increment or decrement progress; values are clamped to `[0, target]`. No partial XP is awarded. Reaching the target automatically completes and rewards the quest in the same transaction. Completed progress cannot be reduced, and concurrent or repeated target operations cannot reward twice.

## Admin and curation

The protected `/admin` area and every curation endpoint require a server-verified `ADMIN` role. Build 1 supplies server-side search, filtering, pagination, create/edit, validation, submit, approve/reject, activate/deactivate, and family-progression inspection. Filters cover rewarded Skill, difficulty, family, review state, active state, eligible pool, and seed/admin ownership.

The review lifecycle is:

```text
DRAFT -> PENDING_REVIEW -> APPROVED
                         -> REJECTED
REJECTED -> PENDING_REVIEW after revision and resubmission
APPROVED --gameplay-relevant edit--> PENDING_REVIEW
```

Only approved definitions may be activated. Deactivation preserves review state and history. A gameplay-relevant edit to approved content—difficulty, Base XP, completion rules, reward Skills/percentages, eligibility, family, or another promised reward/selection input—returns it to pending review and makes it ineligible for new runtime selection until reapproved. Existing accepted snapshots remain unchanged. The whitelist of note-only edits that avoid rereview is narrow.

Admin-created definitions are non-seed-managed and begin `DRAFT + INACTIVE`. Requests use an explicit DTO allowlist, so an editor cannot assign ownership, review state, activation, reviewer, or audit fields. Mutations include the audit record in the same serializable transaction and use the last observed update timestamp to reject stale overwrites. Important actions are recorded in `AdminAuditLog` with actor, action, entity, timestamp, and before/after metadata. Build 1 has no hard-delete operation.

Validation covers XP bands, completion targets, Standard windows, pool eligibility, Skill and reward allocation, controlled Variety Tags, family-tier uniqueness, review metadata, and safety/curation rules. It reports errors rather than silently repairing data. Cost, social-requirement, and safety metadata describe content but do not gate player eligibility in Build 1.

Repository JSON is canonical for seed-managed content. The seed validator checks the full dataset before writes. One transaction, protected by advisory and library locks, upserts canonical records and joins. Repeated imports preserve IDs and counts and restore canonical values. Removed owned content is deactivated, never hard-deleted; non-owned content and all player/runtime history are untouched. A canonical key colliding with a non-owned row aborts for explicit resolution. Admin database edits do not rewrite repository files and may be overwritten by a later canonical import.

## Jobs and reconciliation

Correctness does not depend on a scheduler. Relevant player requests perform defensive lazy reconciliation, while `pnpm jobs:reconcile` provides scheduled maintenance using the same domain services, Player locks, and transaction boundaries.

The externally scheduled command is intended to run hourly. It pages through onboarded Players in batches of 50 by default. Each Player and subsystem has an independent transaction, so one failure is reported without blocking safe work for other Players. Overlapping and repeated runs are safe.

The job:

- marks overdue accepted Standard quests `EXPIRED`, stores their penalty, and leaves their slots blocked;
- expires unfinished old Challenges without penalty or partial XP;
- creates current Daily and Weekly fixed-window sets when missing; and
- invalidates a persisted recommendation when lifecycle state changes.

It does not clear an expired Standard quest, apply failure penalties, award quest or set XP, advance streaks, generate Home recommendations, curate content, reseed data, or perform speculative repair. It requires `DATABASE_URL`, emits a JSON summary of scans, changes, failures, and elapsed time, and exits nonzero if any per-Player reconciliation failed.

## Player UI and UX

Build 1 is a responsive web experience with no hover-only critical interaction.

- Public landing and login explain the product and Google configuration state.
- Onboarding introduces database-loaded Skills, accepts an explicit or device-detected IANA timezone, offers the balanced Focus default, validates the complete allocation, and confirms completion.
- Home leads with Overall Level and XP, then Active Quests, the persisted “What should I do next?” card, Daily/Weekly Challenges, and the eight-Skill overview.
- Active Standard cards show deadline and Complete/Abandon controls; expired cards clearly say that the penalty has not yet been applied and require explicit acknowledgement.
- Each Skill section shows level progress, current/longest streak, active state, current bonus, next-tier progress, Focus-informed context, and exactly three persistent Standard slots.
- Available Standard cards show difficulty, Base XP, estimated minutes, the deadline that will begin on acceptance, COUNT target where applicable, Accept, Reroll with optional feedback, and the harder-family action when available.
- Challenge cards show fixed-window end time, difficulty, status, Base XP and pool bonus, set progress/bonus, and COUNT correction controls with no-partial-XP messaging.
- Profile shows Overall Level/XP, timezone, and current Focus allocation, with links to Settings and Skill progress.
- Settings supports free Focus respec and timezone changes.
- Admin has a separate guarded curation shell and a link back to Player view.

Desktop navigation exposes Home, Profile, Settings, and sign-out. Mobile bottom navigation exposes Home, Skills, Challenges, and Profile; Settings is reachable from Profile. Responsive Playwright coverage includes desktop Chromium and a Pixel 7-sized viewport.

## Technical architecture

Build 1 is a local-first modular monolith:

- Next.js 16 App Router, React 19, and TypeScript 5.9;
- PostgreSQL with Prisma 7 and the `pg` adapter;
- Auth.js/NextAuth.js with Google OAuth;
- REST endpoints as the official reusable application boundary;
- Zod schemas at configuration, content, and API boundaries;
- version-controlled game configuration and canonical seed JSON;
- Tailwind CSS/PostCSS styling;
- Vitest and React Testing Library for unit/component tests, PostgreSQL integration tests for transactions and constraints, and Playwright for browser flows; and
- Docker Compose for the local PostgreSQL dependency while Next.js runs on the host.

Conceptual modules are authentication, player, quests, progression/streaks, challenges, recommendations, admin, and jobs. Core actions enter through reusable service functions used by thin REST handlers, server-rendered pages, or reconciliation. `src/lib/db.ts` owns lazy hot-reload-safe database client creation. The application does not use microservices, a runtime LLM, an in-process cron loop, or client-authoritative gameplay.

Primary REST surfaces are:

- identity and setup: `GET /api/me`, `POST /api/onboarding/complete`, `PUT /api/me/focus`, `PUT /api/me/timezone`;
- Standard quests: `GET /api/quests/standard` and per-quest `accept`, `reroll`, `bump`, `complete`, `abandon`, and `clear` mutations;
- recommendations: `GET /api/recommendations/next`;
- Challenges: `GET /api/challenges` and per-quest `accept`, `complete`, `increment`, and `decrement` mutations; and
- admin: references, list/create/update, and reviewed lifecycle transition endpoints under `/api/admin`.

All important gameplay transitions lock the Player and relevant rows, validate ownership and state, group effects under operation IDs, and commit lifecycle, reward, ledger, progress, streak, set-bonus, and slot-replacement changes atomically. Database foreign keys, checks, uniqueness, and partial indexes protect scalar and “at most one” invariants; transactions and domain validation protect cross-row totals, state machines, accepted snapshots, configuration bands, and cache reconciliation. Recommendation recalculation is explicitly outside the critical gameplay commit.

UTC stores instants; the Player stores an IANA timezone identity. Daily/weekly boundaries use timezone-aware calculations and fixed UTC windows, including DST-tested behavior.

Game-balance values are centralized in `src/config/game.ts` under configuration version `build1-08-v1`. Job cadence and batch size are centralized in `src/config/jobs.ts`. Admin-editable balance configuration did not ship.

## Major data model concepts

The Prisma schema maps singular PascalCase models to snake_case PostgreSQL tables. The important aggregates are:

| Area | Principal models | Purpose |
|---|---|---|
| Identity | `User`, `AuthAccount`, `Player` | Provider identity, role, and separate gameplay profile |
| Focus | `PlayerSkillFocus`, `PlayerSkillFocusHistory` | Current complete allocation and auditable initialization/respec history |
| Progress | `PlayerProgress`, `PlayerSkillProgress`, `PlayerSkillStreak` | Read-optimized Overall/Skill state and local-day streak state |
| Curated library | `Skill`, `QuestFamily`, `QuestDefinition`, `QuestSkill`, `VarietyTag`, `QuestVarietyTag`, `ContextTag`, `QuestContextTag` | Approved reusable content, taxonomies, family tiers, and allocations |
| Runtime quests | `PlayerQuest`, `PlayerQuestSkillSnapshot`, `PlayerQuestFailurePenaltySkill`, `PlayerQuestSlot` | Assigned lifecycle instances, immutable accepted facts, failures, and 24 current Standard slots |
| Challenges | `ChallengeSet` | Daily/Weekly fixed-window identity and exactly-once set-bonus state |
| Rewards | `QuestReward`, `QuestSkillReward`, `XpTransaction` | Immutable reward calculation and signed XP ledger |
| History | `QuestInteraction` | Append-only player signals for audit and recommendations |
| Curation audit | `AdminAuditLog` | Atomic actor/action and before/after records |
| Recommendations | `PlayerRecommendation` | One persisted, invalidatable Home selection per Player |

The schema enums bound role, difficulty, completion type, pool, lifecycle state, review state, cost/social/safety metadata, XP scope and transaction type, interaction/feedback type, and admin action. The `ADJUSTMENT` ledger type exists for possible tightly authorized reconciliation policy but has no player-facing Build 1 behavior.

## Build 1 acceptance status

Build 1 is complete. Every checkbox in [BUILD1_ACCEPTANCE.md](BUILD1_ACCEPTANCE.md) is checked, including the end-to-end player journey, administrator capability, responsive UX, and concurrency/reliability gates.

The completed verification scope covers:

- fresh database migrations and canonical transactional seeding;
- Google-compatible authentication behavior without requiring live Google in automated tests;
- onboarding, Focus history/respec, timezone changes, session-derived authorization, and admin denial/allowance;
- exactly 24 persistent Standard slots, eligibility and weighted selection, reroll, harder-family tier skipping, acceptance snapshots, and deadlines;
- completion, XP splitting and bonuses, levels, streaks, abandon, expiration without implicit penalty, explicit clear, and same-slot refill;
- stable persisted Home recommendations drawn only from existing available slots;
- Daily/Weekly selection and fixed windows, SINGLE and COUNT actions, expiration, individual bonuses, and exactly-once set bonuses;
- admin search/filter/editor/workflow, validation, audit, stale-write protection, and runtime eligibility;
- scheduled and lazy reconciliation convergence and retry safety;
- duplicate and concurrent completion, abandonment, clear, COUNT, set bonus, and slot-replacement behavior; and
- unit/component, PostgreSQL integration/API, production build, and authenticated desktop/Pixel 7 Playwright coverage.

Live Google consent/callback remains a deployment configuration check because automated tests intentionally do not depend on Google's external service. Tests use normal encrypted Auth.js cookies created by test-owned fixture code; the application contains no production authentication bypass.

## Intentional Build 1 constraints

These are deliberate boundaries of the shipped baseline, not accidental omissions:

- Browser application only; no native mobile client.
- Google login only and one Player per User.
- Honor-system completion with no external verification.
- Exactly eight flat Skills; no trees or subskills.
- Exactly three persistent Standard slots per Skill.
- Curated approved/active content only; no user-generated or runtime AI-generated quests.
- Free unlimited pre-acceptance Standard rerolls and Focus respecs.
- No penalty for unaccepted offers or unfinished Challenges.
- Expired Standard penalties require explicit player acknowledgement.
- One ordinary streak per Player/Skill; no grace, freeze, or Challenge-specific streak.
- Fixed Daily/Weekly windows; no monthly or custom Challenge pool.
- Simple `PLAYER`/`ADMIN` authorization and curation workflow.
- Version-controlled game balance; no admin balance editor.
- Externally scheduled process-to-completion reconciliation plus lazy fallback, not an internal scheduler.
- Modular monolith and one PostgreSQL database, not services or event sourcing.
- No hard deletion of quest definitions through the Build 1 admin workflow.

## Deferred Backlog

The following items are explicitly outside Build 1. Backlog placement is not approval; each requires its own future product specification.

### Progression and economy

- Skill trees and subskills
- XP decay
- Character customization
- Equipment, items, and pets
- Gold economy
- Paid or limited rerolls
- Saves
- Achievements and badges
- Focus respec cost or cooldown

### Social and multiplayer

- Friends
- Leaderboards
- Parties
- Guilds
- Competitive multiplayer

### Quest intelligence and verification

- Goal-to-questline generation
- User-created quests
- AI Game Master chat
- Runtime LLM quest generation
- Completion verification
- AI admin quest-generation UI

### Integrations and clients

- Health, calendar, finance, and location integrations
- Native mobile application
- Apple or Microsoft login

### Administration

- Sophisticated admin permissions or team workflows
- Complicated CMS features
- CSV quest import
- Admin-editable game-balance configuration

## Build 2 Candidates

No Build 2 scope is approved by this document. The backlog above supplies candidate problem areas, not a roadmap. A Build 2 planning process could evaluate them in coherent themes:

- **Deeper progression:** decide whether Skills need subskills, achievements, personalization, or an economy without weakening action-based, non-pay-to-win progression.
- **Goal continuity:** explore goal-to-questline planning, saved quests, or player-created content while preserving curated safety and server authority.
- **Social motivation:** assess friends, cooperative structures, or leaderboards with explicit privacy, abuse, and fairness requirements.
- **External evidence and convenience:** assess calendar, health, finance, or location integrations and additional identity providers with consent, data minimization, and failure-mode designs.
- **Curation scale:** assess team roles, import tooling, assisted offline candidate generation, or balance-management workflows without allowing unreviewed runtime content.
- **Client reach:** assess a native client only after confirming that the REST contracts and authentication model support it cleanly.

Candidate selection should start from a user problem and measurable desired outcome, not from the mere presence of a backlog item.

## Design Decisions Worth Revisiting

These are tensions for deliberate Build 2 design. They do not alter the frozen Build 1 answer.

- **Motivation versus pressure:** Build 1 uses XP, deadlines, failure penalties, and streaks, while also allowing expired penalties to wait behind explicit acknowledgement. Any stronger enforcement, decay, limited rerolls, or streak protection changes the emotional contract and needs user research.
- **Personal agency versus balance:** Focus expresses preference and Catch-Up gently promotes neglected Skills without hard gates. Changes to their strength, eligibility effect, or respec cost could make the system feel either more personal or more coercive.
- **Persistent choice versus freshness:** 24 durable slots provide reliability but can create a large choice surface. Changing slot count, refresh rules, saves, or recommendation prominence affects lifecycle and migration invariants.
- **Curated quality versus content scale:** Approved/active content and repository ownership provide safety and reproducibility. User-generated, imported, or AI-assisted content needs provenance, review, moderation, rollback, and snapshot rules before it can enter runtime selection.
- **Honor system versus verification:** Integrations or completion evidence may increase confidence but also introduce surveillance, inequity, privacy risk, and external-service failure. Self-reporting is the shipped default.
- **Simple progression versus richer economy:** Levels and XP are legible and auditable. Items, currency, decay, or customization would require an economy model, transactional contracts, idempotency, migration policy, and non-pay-to-win safeguards.
- **Local-calendar meaning versus timezone mobility:** Fixed Challenge windows and completion-time local streak dates preserve history. Any travel-aware or timezone-retroactive rule needs explicit anti-exploit and DST semantics.
- **One identity/Player versus expansion:** Additional providers, account linking, multiple Players, households, or organizations require a deliberate identity-ownership and recovery model; matching emails alone must not become an unsafe merge rule.
- **Simple administration versus operational power:** More roles, balance editing, ledger adjustments, or bulk imports increase leverage and risk. Authorization, approval, audit, preview, rollback, and separation-of-duties policies must precede them.
- **Modular monolith versus operational scale:** Build 1 benefits from single-database transactions. Splitting services would make gameplay atomicity, locks, idempotency, and reconciliation materially harder and should be driven by measured constraints.

## Build 2 planning guardrails

Build 2 planning and implementation should preserve these rules unless an explicit owner-approved product decision changes them and updates the correct canonical documentation:

1. Start with the specialized Build 1 contracts and this baseline; identify exactly which shipped behavior would change.
2. Separate product-rule decisions from implementation details. Do not infer new game behavior from a technical opportunity or backlog label.
3. Keep the server authoritative and expose core gameplay through reusable services and REST boundaries for future clients.
4. Preserve atomicity across quest lifecycle, XP, penalties, rewards, levels, streaks, set bonuses, and slot replacement.
5. Design every reward, penalty, progress, import, and reconciliation operation for retries and concurrency before implementation.
6. Preserve accepted snapshots, ledger immutability, historical QuestDefinitions, and backward compatibility unless an explicit migration defines otherwise.
7. Keep game-balance values centralized and version-controlled. Define how configuration versions affect already accepted and historical gameplay.
8. Require `APPROVED + ACTIVE` for runtime curated content. Any new content source needs explicit provenance, review, safety, ownership, and deactivation rules.
9. Do not add a runtime LLM dependency to ordinary quest selection without an explicit reversal of the shipped product boundary and a safe deterministic fallback.
10. Specify timezones, local dates, DST, fixed windows, travel, and retroactivity for every time-based feature.
11. Extend the immutable XP ledger and audit trail rather than mutating history or bypassing reconciliation.
12. Add database constraints where possible and transactional cross-row validation where necessary; do not rely on UI validation for invariants.
13. Update unit, integration/concurrency, API, and desktop/mobile end-to-end tests whenever behavior changes.
14. Update the relevant current canonical documents as decisions are approved. Keep this file as the historical record of what Build 1 shipped.
15. Treat privacy, accessibility, safety, socioeconomic neutrality, and action-within-player-control principles as product requirements, especially for social features and integrations.
16. Prefer extending the modular monolith until measured needs justify additional infrastructure.

## Build 1 handoff

The Build 1 system is a complete, tested foundation: a new player can authenticate, establish priorities, choose from persistent curated quests, accept real-life commitments, receive transactionally correct progress and streaks, use a stable recommendation, participate in fixed-window Challenges, and revisit their priorities. Administrators can safely curate the library, and scheduled plus lazy reconciliation keeps time-based state convergent without silently applying player penalties.

For Build 2, begin with the frozen facts in this document, select and specify a narrow problem, update its specialized contract, design migration and concurrency behavior, and only then change the implementation. Do not reinterpret a candidate or backlog entry as approved scope.
