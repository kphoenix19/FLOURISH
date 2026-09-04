# Game Rules

Status: authoritative gameplay contract for Build 1. Data enforcement is specified in [DATA_MODEL.md](DATA_MODEL.md); configurable scoring is in [RECOMMENDATION_ENGINE.md](RECOMMENDATION_ENGINE.md).

## Progression

### Overall progression

- Overall XP is monotonically increasing and Overall Level is effectively uncapped.
- Failure never reduces Overall XP.
- The Overall curve may differ from the skill curve and should progress slightly slower.

### Skill progression

- Current Skill XP determines Current Skill Level and may rise or fall.
- Lifetime Skill XP is monotonically increasing.
- Skill Level may rise or fall and is capped at 100 for MVP.
- All eight skills use the same skill-level curve.
- Failure penalties reduce Current Skill XP only, never Lifetime Skill XP.

Level curves and the behavior at a Current Skill XP floor are **OPEN DECISION**. The chosen curves/floor rule must be centralized in configuration before progression is implemented.

### Base XP and difficulty

Base XP is 50–1000. Initial configurable bands:

| Difficulty | Base XP |
|---|---:|
| Easy | 50–99 |
| Medium | 100–249 |
| Hard | 250–499 |
| Epic | 500–749 |
| Legendary | 750–1000 |

### Multi-skill distribution

Each QuestDefinition has exactly one primary skill, up to two secondary skills, and no more than three rewarded skills. Reward percentages total 100%. XP is distributed, never duplicated: a 100 XP quest split 70% Stewardship / 30% Us grants +70 and +30 skill XP and +100 Overall XP before bonuses.

Streak bonuses apply to each distributed skill share; the sum of final rewarded skill shares contributes to Overall XP, along with any Overall-only set bonus. Catch-Up and Challenge bonus allocation are described below.

**OPEN DECISION:** deterministic integer rounding and residual allocation across skill shares and percentage bonuses. No implementation may invent this rule.

## Quest definitions and families

Definitions support identity, text, difficulty, base XP, estimated active minutes, completion window, SINGLE/COUNT completion, target, Standard/Daily/Weekly eligibility, skills and percentages, variety/context tags, optional family, safety/curation metadata, review status, and active state. Runtime selection requires `APPROVED + ACTIVE`.

A QuestFamily groups naturally related difficulty variants. It has at most one definition per difficulty. Families may omit tiers; quests need not belong to a family.

The harder-family action (🔥 in UI) replaces an AVAILABLE Standard quest with the next approved, active, Standard-eligible higher-difficulty member of the same family, skipping absent tiers. It does not generate content and is unavailable after acceptance. The replacement remains in the same skill slot and the interaction is recorded. Do not create artificial families merely to enable this action.

**OPEN DECISION:** whether use of 🔥 has any recommendation-history effect beyond recording the interaction, and the precise behavior when the higher variant’s primary skill does not match the slot (content curation should normally prevent this).

## Standard Quest slots

Every Player has exactly three explicit Standard slots for each of eight skills: 24 total. A slot is uniquely identified by player, skill, and slot number 1–3 and points to its current PlayerQuest.

An AVAILABLE Standard quest has no deadline or penalty, persists across reloads, and does not auto-expire. It may be accepted, rerolled, or upgraded through 🔥 when eligible. Generating a Standard quest fills a slot; it never creates an untracked “25th quest.”

## Standard lifecycle

```text
AVAILABLE --accept--> ACCEPTED --complete--> COMPLETED (terminal)
                              --abandon----> ABANDONED (terminal)
                              --deadline----> EXPIRED --clear--> penalty applied + slot refill
```

Acceptance is the commitment boundary. On `AVAILABLE → ACCEPTED`, record `accepted_at`, snapshot gameplay values, and set `deadline_at = accepted_at + completion_window_hours`. Allowed initial Standard windows are 24, 48, or 72 hours.

### Complete

`ACCEPTED → COMPLETED` atomically awards XP, updates progress and streaks, and immediately refills a Standard slot. Completion is terminal and cannot be undone.

### Abandon

`ACCEPTED → ABANDONED` is immediate acknowledged failure. Atomically calculate/apply the configured Current Skill XP penalty, preserve Overall and Lifetime Skill XP, and refill the slot. It needs no later acknowledgement.

### Passive expiration and clear

After the deadline, lazy or scheduled reconciliation changes `ACCEPTED → EXPIRED`, records `expired_at`, calculates/stores the penalty, but does not apply it. The expired quest stays in and blocks its Standard slot. Clearing it applies the stored penalty once, records `failure_penalty_applied_at` and `cleared_at`, updates skill progress, and refills the slot.

Players may leave an expired quest uncleared indefinitely, avoiding the penalty while sacrificing the slot. Opening the application must never silently apply a deadline penalty.

**OPEN DECISION:** failure-penalty formula, its distribution for multi-skill quests, and whether Current Skill XP may fall below zero. These must be decided before abandonment/clear implementation.

## Rerolls

Rerolls are free, unlimited, Standard-only, and only available before acceptance. A reroll replaces the current available quest, records history, excludes the old definition from the immediate selection context, does not permanently ban it, and prefers different activity/variety when practical.

Optional feedback: `TOO_HARD`, `NO_TIME`, `NOT_INTERESTED`, `JUST_DIFFERENT`. Generic reroll is weak negative; `NOT_INTERESTED` strongest; `TOO_HARD` suppresses harder content; `NO_TIME` favors shorter quests; `JUST_DIFFERENT` has little or no durable negative effect. Initial modifiers are in [RECOMMENDATION_ENGINE.md](RECOMMENDATION_ENGINE.md).

## Challenges

Daily and Weekly pools are independently generated. They may share a skill but the same QuestDefinition must not be simultaneously active in both pools for one player. Both require explicit acceptance, have no reroll or failure penalty, and use Easy/Medium/Hard/Epic definitions; Legendary is excluded. Unfinished quests become `EXPIRED` at window reset whether unaccepted or accepted-incomplete; `accepted_at` and progress preserve history.

### Daily

- Generate three Challenges in three unique skills.
- Focus/Catch-Up weighted and easier-biased than Standard.
- Initial configurable Challenge XP bonus: 10%.
- Reset at 12:00 AM player local time.
- Completing 3/3 grants a configurable Overall-only Daily set bonus exactly once.

### Weekly

- Generate five Challenges in five unique skills.
- Focus/Catch-Up weighted and harder/value-biased relative to Daily.
- Use a separate configurable Weekly bonus.
- Reset Monday at 12:00 AM player local time.
- Completing 5/5 grants a configurable Overall-only Weekly set bonus exactly once.

**OPEN DECISION:** initial Weekly challenge bonus, Daily and Weekly set-bonus amounts, and exact Daily/Weekly difficulty distributions.

## Completion types

`SINGLE` requires target 1. `COUNT` requires target greater than 1. COUNT progress may increment or decrement after acceptance, is clamped to `[0, target]`, and awards no partial XP. Reaching target automatically and atomically completes and rewards the quest. Completed progress cannot be reduced. Duplicate/concurrent target operations cannot reward twice.

## Catch-Up

Rank skills by Current Skill Level, then Current Skill XP ascending. The lowest skill receives a configurable Catch-Up XP bonus. For recommendation weighting, initial configurable ranks are: lowest 1.30, second 1.20, third 1.10, all others 1.00. Multi-skill recommendation modifiers are combined by reward percentage. Focus and Catch-Up multiply and neither hard-excludes content.

**OPEN DECISION:** tie-breaking when both level and Current Skill XP are equal, the Catch-Up XP bonus amount/formula, and how that XP bonus is allocated for multi-skill quests.

## Streaks

Streaks belong to skills. A streak advances or is maintained when at least one accepted Standard, Daily, or Weekly quest rewarding that skill completes during a local calendar day. Multi-skill completion qualifies every rewarded skill. Multiple completions in one skill/day count once. Abandoned, expired, and rerolled quests do not count. Missing one calendar day resets the streak; MVP has no grace/freeze.

Initial configurable tiers:

| Current streak | Bonus |
|---|---:|
| 0–2 days | 0% |
| 3–6 | 5% |
| 7–13 | 10% |
| 14–29 | 15% |
| 30+ | 20% |

The applicable streak bonus is evaluated per rewarded skill share. **OPEN DECISION:** whether the completion that first reaches a threshold receives the new tier or the previously established tier; define before XP implementation.

## Timezone and reset rules

Store an explicit IANA timezone such as `America/Denver`. Daily boundaries are midnight local time; weekly boundaries are Monday midnight local time. Challenge records store fixed UTC `window_start_at`/`window_end_at`. A later timezone change affects future pools and future streak boundaries, never existing Challenge windows or Standard deadlines.

Use scheduled maintenance plus defensive lazy reconciliation. Correctness must not depend on cron alone.

