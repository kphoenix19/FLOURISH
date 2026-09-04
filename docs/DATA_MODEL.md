# Data Model

Status: authoritative intended domain model for Build 1. This is ORM-neutral; names use `snake_case` for database clarity. PostgreSQL constraints should be used when practical, with transactional application validation for cross-row invariants.

## Common conventions

- Primary identifiers are UUIDs unless an externally required type dictates otherwise.
- Timestamps are timezone-aware UTC instants (`timestamptz`); names ending `_at` follow this rule.
- Mutable entities include `created_at` and `updated_at` unless explicitly immutable.
- XP and percentages are integers; percentages are whole points totaling 100.
- `operation_id` is a client/server-generated UUID used to group and deduplicate important operations.
- Levels are derived from XP, not independently awarded, and have no transaction table.

## Enums

| Enum | Values |
|---|---|
| `SkillCode` | `FITNESS`, `LEARNING`, `OCCUPATION`, `US`, `REFLECTION`, `INVESTING`, `STEWARDSHIP`, `HOBBIES` |
| `Difficulty` | `EASY`, `MEDIUM`, `HARD`, `EPIC`, `LEGENDARY` |
| `CompletionType` | `SINGLE`, `COUNT` |
| `PoolType` | `STANDARD`, `DAILY`, `WEEKLY` |
| `PlayerQuestStatus` | `AVAILABLE`, `ACCEPTED`, `COMPLETED`, `ABANDONED`, `EXPIRED` |
| `ReviewStatus` | `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `XpScope` | `OVERALL`, `SKILL_CURRENT`, `SKILL_LIFETIME` |
| `XpTransactionType` | `QUEST_REWARD`, `FAILURE_PENALTY`, `DAILY_SET_BONUS`, `WEEKLY_SET_BONUS`, `ADJUSTMENT` |
| `InteractionType` | `ASSIGNED`, `ACCEPTED`, `REROLLED`, `UPGRADED`, `COMPLETED`, `ABANDONED`, `EXPIRED`, `CLEARED`, `PROGRESS_INCREMENTED`, `PROGRESS_DECREMENTED`, `RECOMMENDED` |
| `FeedbackReason` | `TOO_HARD`, `NO_TIME`, `NOT_INTERESTED`, `JUST_DIFFERENT` |
| `UserRole` | `PLAYER`, `ADMIN` |
| `CostLevel` | `NONE`, `LOW`, `MODERATE`, `HIGH` |
| `SocialRequirement` | `NONE`, `OPTIONAL`, `REQUIRED` |
| `SafetyCategory` | `GENERAL`, `FITNESS`, `FINANCIAL`, `SPIRITUAL` |
| `AdminAuditAction` | `CREATE`, `UPDATE`, `SUBMIT_REVIEW`, `APPROVE`, `REJECT`, `ACTIVATE`, `DEACTIVATE` |

The curation metadata enums are descriptive and are not player eligibility gates in Build 1. `ADJUSTMENT` requires a future tightly authorized operational policy; it is present to allow ledger reconciliation, not player gameplay.

## Identity and player

### User

| Field | Notes |
|---|---|
| `id` | PK |
| `email` | normalized; unique when non-null |
| `name`, `image_url` | nullable provider-facing profile values |
| `role` | UserRole, default `PLAYER` |
| `created_at`, `updated_at` | timestamps |

Relationships: has many AuthAccounts; has one Player in MVP. Constraint: unique Player `user_id`.

### AuthAccount

| Field | Notes |
|---|---|
| `id` | PK |
| `user_id` | FK User, cascade/restrict according to account deletion policy |
| `provider` | Build 1 runtime value `google` |
| `provider_account_id` | provider identity |
| `type`, token/provider fields | Auth.js-compatible; sensitive values protected |
| `created_at`, `updated_at` | timestamps |

Unique `(provider, provider_account_id)`; index `user_id`.

### Player

| Field | Notes |
|---|---|
| `id` | PK |
| `user_id` | FK User, unique for MVP |
| `timezone` | valid IANA identifier |
| `onboarding_completed_at` | nullable |
| `created_at`, `updated_at` | timestamps |

Changing timezone affects future windows/streak boundaries only. Validate timezone in application code/library; database stores the identifier.

### Skill

| Field | Notes |
|---|---|
| `id` | PK |
| `code` | unique `SkillCode` |
| `name`, `description` | canonical display metadata |
| `sort_order` | unique 1–8 |

Seed exactly the eight canonical FLOURISH skills.

### PlayerSkillFocus

| Field | Notes |
|---|---|
| `player_id`, `skill_id` | composite PK/FKs |
| `points` | check 1–10 |
| `updated_at` | timestamp |

Cross-row invariant: exactly one row per skill and sum equals configured total (initially 46). Enforce in the allocation transaction under player-level locking; a simple check constraint cannot enforce the sum.

### PlayerSkillFocusHistory

| Field | Notes |
|---|---|
| `id` | PK |
| `operation_id` | groups all eight rows in one allocation; indexed |
| `player_id`, `skill_id` | FKs |
| `points` | allocation snapshot, check 1–10 |
| `effective_at` | timestamp |

Unique `(operation_id, skill_id)`; index `(player_id, effective_at desc)`. One operation must contain all eight skills totaling the configured amount; transactional validation.

## Progress and streaks

### PlayerProgress

| Field | Notes |
|---|---|
| `player_id` | PK/FK Player |
| `overall_xp` | nonnegative, monotonically increasing |
| `overall_level` | derived cache, positive |
| `updated_at` | timestamp |

The curve is configurable. Updates must reconcile exactly to ledger effects.

### PlayerSkillProgress

| Field | Notes |
|---|---|
| `player_id`, `skill_id` | composite PK/FKs; unique pair |
| `current_xp` | may rise/fall; check >=0 |
| `lifetime_xp` | nonnegative and monotonically increasing |
| `current_level` | derived cache, capped at 100 |
| `updated_at` | timestamp |

Application transactions ensure Lifetime XP never decreases, failure penalties clamp Current XP at zero, and level matches Current XP. Exact Overall and Skill level curves remain **OPEN DECISION — resolve during the XP/progression implementation phase**.

### PlayerSkillStreak

| Field | Notes |
|---|---|
| `player_id`, `skill_id` | composite PK/FKs; unique pair |
| `current_days` | nonnegative |
| `longest_days` | nonnegative, at least current where applicable |
| `last_qualified_local_date` | nullable date interpreted with boundary timezone at completion |
| `updated_at` | timestamp |

Timezone-boundary calculation and one increment per local date are transactionally validated. If auditability across timezone changes requires it, storing the timezone used per qualifying event is an implementation detail or may be added via an event record.

## Quest library

### QuestFamily

`id` PK; `name`; optional `description`; `active`; timestamps. Family membership is optional. Family plus difficulty is unique on QuestDefinition when family is non-null.

### QuestDefinition

| Field | Notes |
|---|---|
| `id` | PK |
| `quest_family_id` | nullable FK QuestFamily |
| `title` | required |
| `short_description` | required |
| `difficulty` | Difficulty |
| `base_xp` | check 50–1000 and configured difficulty band |
| `estimated_minutes` | positive integer active minutes |
| `completion_window_hours` | for Standard: 24, 48, or 72 |
| `completion_type` | SINGLE or COUNT |
| `completion_target` | SINGLE=1; COUNT>1 |
| `standard_eligible`, `daily_eligible`, `weekly_eligible` | booleans |
| `stable_key` | unique, stable human-readable canonical seed identifier |
| `cost_level` | CostLevel |
| `social_requirement` | SocialRequirement |
| `safety_category` | SafetyCategory |
| `curator_value_score` | required bounded integer scale; schema bounds are an implementation detail established with seed validation |
| `curator_difficulty_reason` | required review rationale |
| `review_status` | ReviewStatus |
| `reviewed_by` | nullable FK User/admin identity |
| `reviewed_at` | nullable; required for approved/rejected |
| `curator_notes` | nullable |
| `active` | boolean |
| `created_at`, `updated_at` | timestamps |

Indexes: `(review_status, active)`, each eligibility flag combined with review/active/difficulty, `quest_family_id`, title search index as supported. Partial unique index `(quest_family_id, difficulty) WHERE quest_family_id IS NOT NULL`. Runtime filter is approved, active, and pool-eligible. Cross-field checks enforce completion target. Difficulty-band and workflow checks may use transactional application validation because values are configurable.

### QuestSkill

| Field | Notes |
|---|---|
| `quest_definition_id`, `skill_id` | composite PK/FKs |
| `is_primary` | boolean |
| `reward_percent` | integer check 1–100 |

Exactly one primary, 1–3 total rows, and sum 100. A partial unique index can enforce at most one primary; transactionally validate at least one, row count, and sum before approval/activation. Index `skill_id`.

### VarietyTag

`id` PK; `skill_id` FK Skill; `slug`; `display_name`; `active`. Unique `(skill_id, slug)`. Seed only approved taxonomy.

### QuestVarietyTag

`quest_definition_id`, `variety_tag_id` composite PK/FKs; `is_primary` boolean. Exactly one primary and 1–3 rows per definition; at most one primary via partial unique index, remaining invariants transactionally. Tags should belong to a rewarded/relevant skill; exact cross-skill validation is application-level.

### ContextTag

`id` PK; `slug` unique; `display_name`; optional `description`; `active`.

### QuestContextTag

`quest_definition_id`, `context_tag_id` composite PK/FKs. Index reversed lookup on `context_tag_id`. Context taxonomy/cardinality are implementation/content details until product requirements need constraints.

## Runtime quests and slots

### PlayerQuest

| Field | Notes |
|---|---|
| `id` | PK |
| `player_id` | FK Player, indexed |
| `quest_definition_id` | FK QuestDefinition, indexed |
| `pool_type` | STANDARD/DAILY/WEEKLY |
| `status` | PlayerQuestStatus |
| `current_progress` | integer check >=0 and <= target snapshot |
| `assigned_at` | required |
| `accepted_at`, `deadline_at`, `completed_at`, `abandoned_at`, `expired_at`, `cleared_at` | nullable lifecycle timestamps |
| `window_start_at`, `window_end_at` | fixed Challenge window; null for Standard |
| `difficulty_snapshot` | required |
| `base_xp_snapshot` | required |
| `completion_type_snapshot` | required |
| `completion_target_snapshot` | required |
| `completion_window_hours_snapshot` | nullable/non-null according to Standard eligibility/use |
| `reward_snapshot` | structured immutable rewarded Skill IDs/codes and percentages plus reward-affecting configuration/version inputs |
| `failure_penalty_xp` | nullable until calculated; nonnegative stored magnitude |
| `failure_penalty_applied_at` | nullable |
| `created_at`, `updated_at` | timestamps |

Indexes: `(player_id, pool_type, status)`, `(player_id, deadline_at)` for accepted deadlines, `(player_id, window_end_at)` for Challenge reconciliation, definition/status lookup. Application state-machine validation governs timestamps/status. AVAILABLE Standard has no deadline; ACCEPTED Standard has deadline. Challenges require window fields and never a failure penalty. At acceptance, snapshot difficulty, Base XP, completion type/target/window, rewarded Skills/percentages, and every other mutable reward input whose later change could alter the promised outcome. Storage may use normalized snapshot rows or validated structured data, but changing QuestDefinition after acceptance must never alter the promised gameplay outcome.

### PlayerQuestSlot

| Field | Notes |
|---|---|
| `id` | PK |
| `player_id`, `skill_id` | FKs |
| `slot_number` | check 1–3 |
| `current_player_quest_id` | FK PlayerQuest, unique when non-null |
| `created_at`, `updated_at` | timestamps |

Unique `(player_id, skill_id, slot_number)`. Transactional validation ensures current quest belongs to player, is STANDARD, has the appropriate primary/slot skill contract, and is in a slot-occupying state (`AVAILABLE`, `ACCEPTED`, or uncleared `EXPIRED`). Completion/abandon/clear and replacement occur under locking in one transaction.

## Rewards and ledger

### QuestReward

| Field | Notes |
|---|---|
| `id` | PK |
| `operation_id` | UUID, unique/idempotency key |
| `player_quest_id` | FK PlayerQuest, unique |
| `base_xp` | snapshot/calculated integer |
| `catch_up_bonus_xp` | integer >=0 |
| `streak_bonus_xp` | integer >=0 |
| `challenge_bonus_xp` | integer >=0 |
| `other_bonus_xp` | integer >=0; set bonus should remain separately typed in ledger |
| `final_overall_xp` | integer >=0 |
| `calculated_at` | timestamp |

One QuestReward per completed quest. Formula must reconcile with QuestSkillRewards and XpTransactions using the canonical largest-remainder allocation rule.

### QuestSkillReward

| Field | Notes |
|---|---|
| `quest_reward_id`, `skill_id` | composite PK/FKs |
| `reward_percent` | check 1–100 |
| `base_skill_xp` | nonnegative integer |
| `bonus_skill_xp` | nonnegative integer |
| `final_skill_xp` | nonnegative integer |

Rows snapshot the accepted distribution. Cross-row percent total is 100 and final values reconcile to reward totals; transactional validation.

### XpTransaction

| Field | Notes |
|---|---|
| `id` | PK |
| `operation_id` | UUID, indexed; uniqueness combined with logical line identity |
| `player_id` | FK Player, indexed |
| `player_quest_id` | nullable FK PlayerQuest |
| `skill_id` | nullable FK Skill |
| `xp_scope` | XpScope |
| `transaction_type` | XpTransactionType |
| `amount` | signed integer; penalties are negative current-skill entries |
| `created_at` | immutable timestamp |

Overall scope requires null skill; skill scopes require skill. Failure penalty permits only `SKILL_CURRENT`, never Overall or Lifetime. Quest reward writes Overall plus Current and Lifetime skill ledger effects. Unique `(operation_id, xp_scope, skill_id, transaction_type)` is a starting idempotency constraint; if legitimate multiple lines of the same type are needed, add an explicit line key rather than weaken idempotency.

Set bonuses are Overall-only XpTransactions tied to the persisted ChallengeSet/window described below.

### ChallengeSet

| Field | Notes |
|---|---|
| `id` | PK |
| `player_id` | FK Player |
| `pool_type` | DAILY or WEEKLY only |
| `window_start_at`, `window_end_at` | fixed UTC window |
| `set_bonus_awarded_at` | nullable timestamp; set once atomically |
| `set_bonus_operation_id` | nullable UUID, unique when present |
| `created_at`, `updated_at` | timestamps |

Unique `(player_id, pool_type, window_start_at, window_end_at)`. Challenge PlayerQuests reference their ChallengeSet through `challenge_set_id` (nullable for Standard). Lock this row when completing a Challenge that may finish the set. Award eligibility and `set_bonus_awarded_at` update occur in the same transaction, so a set bonus is awarded at most once without relying on XP-history scans.

### QuestInteraction

| Field | Notes |
|---|---|
| `id` | PK |
| `operation_id` | nullable UUID, indexed |
| `player_id` | FK Player, indexed |
| `quest_definition_id` | FK QuestDefinition, indexed |
| `player_quest_id` | FK PlayerQuest, indexed |
| `interaction_type` | InteractionType |
| `feedback_reason` | nullable FeedbackReason; valid primarily for reroll |
| `created_at` | timestamp |

Index `(player_id, created_at desc)` and `(player_id, quest_definition_id, created_at desc)` for recommendation history. Interactions are append-only audit/history signals.

For recommendation history, Build 1 similarity means the same FLOURISH Skill and same primary Variety Tag; use approximately the most recent 20 relevant interactions.

## Admin audit

### AdminAudit

| Field | Notes |
|---|---|
| `id` | PK |
| `actor_user_id` | FK User; actor must have ADMIN role at mutation time |
| `action` | AdminAuditAction |
| `entity_type` | bounded string or enum identifying the curated entity type |
| `entity_id` | identifier of the affected entity |
| `before_metadata`, `after_metadata` | nullable structured JSON snapshots/change metadata |
| `created_at` | immutable timestamp |

Index `(entity_type, entity_id, created_at desc)` and `(actor_user_id, created_at desc)`. This is a lightweight audit trail, not an event-sourcing mechanism.

## Persisted Home recommendation

The product requires a persisted recommendation and invalidation. Add a `PlayerRecommendation` entity (not in the minimum list but required by the behavior): `id`, `player_id` unique, `player_quest_id` FK, optional safe `reason_codes`, `calculated_at`, `invalidated_at`, `config_version`, timestamps. It must reference an existing AVAILABLE Standard quest owned by the player. Recalculation failure may leave it invalid/null and cannot affect committed gameplay.

## Transactional invariant summary

Database constraints should enforce scalar checks, foreign keys, uniqueness, and “at most one primary.” Transactions/application validation must enforce cross-row totals/counts, exactly one primary, full Focus allocation, state-machine timestamps, configurable bands, accepted snapshots, reward/ledger reconciliation, slot ownership/state, set-bonus once-only semantics, and progression caches matching immutable ledger effects.

All completion, abandonment, expiration clearing, COUNT target completion, slot replacement, and set-award operations lock affected rows and use operation IDs. No operation may expose partial state.
