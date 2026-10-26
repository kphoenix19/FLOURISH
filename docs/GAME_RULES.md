# Game Rules

Status: authoritative gameplay contract for Build 1. Data enforcement is specified in [DATA_MODEL.md](DATA_MODEL.md); configurable scoring is in [RECOMMENDATION_ENGINE.md](RECOMMENDATION_ENGINE.md).

## Progression

### Overall progression

- Overall XP is monotonically increasing and Overall Level is effectively uncapped.
- Failure never reduces Overall XP.
- The Overall curve may differ from the skill curve and should progress slightly slower.

### Skill progression

- Current Skill XP determines Current Skill Level and may rise or fall, but has a hard floor of 0.
- Lifetime Skill XP is monotonically increasing.
- Skill Level may rise or fall and is capped at 100 for MVP.
- All eight skills use the same skill-level curve.
- Failure penalties reduce Current Skill XP only, never Lifetime Skill XP.

Build 1 uses gently accelerating integer polynomial curves. For the transition from level `L` to `L+1`, Skill XP required is `100 + 20(L-1) + 2(L-1)^2`; Overall XP required is `200 + 35(L-1) + 3(L-1)^2`. Cumulative XP is the exact integer sum of all prior transitions. Skill Level caps at 100, but earned Current Skill XP continues accumulating above the level-100 threshold. Overall Level is uncapped.

| Level | Skill cumulative XP | Overall cumulative XP |
|---:|---:|---:|
| 2 | 100 | 200 |
| 5 | 548 | 1,052 |
| 10 | 2,028 | 3,672 |
| 25 | 16,568 | 27,432 |
| 50 | 104,468 | 165,032 |
| 75 | 326,118 | 506,382 |
| 100 | 744,018 | 1,145,232 |

These curves make early levels reachable with ordinary Easy quests, slow gradually without exponential growth, and make Overall progression slower because every rewarded Skill contributes to Overall XP. Coefficients and the Skill cap live in version-controlled game configuration.

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

Streak bonuses apply to each distributed skill share; the sum of final rewarded skill shares contributes to Overall XP, along with any Overall-only set bonus. Catch-Up and Challenge bonus allocation are described below. Percentage XP uses exact integer **round half up**: `floor((amount * percent + 50) / 100)`. Catch-Up and streak bonuses stack additively from each Base Skill XP share; streak is not applied to Catch-Up-enhanced XP.

Whenever integer XP is distributed by percentages, use deterministic **largest-remainder allocation**: calculate proportional raw shares, floor each share, then assign remaining units in descending fractional-remainder order. Ties resolve by FLOURISH Skill code ascending. Distributed shares must reconcile exactly to the intended distributable total. Thus 101 XP at 70%/30% produces integer shares totaling exactly 101.

## Quest definitions and families

Definitions support identity, text, difficulty, base XP, estimated active minutes, completion window, SINGLE/COUNT completion, target, Standard/Daily/Weekly eligibility, skills and percentages, variety/context tags, optional family, safety/curation metadata, review status, and active state. Runtime selection requires `APPROVED + ACTIVE`.

A QuestFamily groups naturally related difficulty variants. It has at most one definition per difficulty. Families may omit tiers; quests need not belong to a family.

The harder-family action (🔥 in UI) replaces an AVAILABLE Standard quest with the next approved, active, Standard-eligible higher-difficulty member of the same family, skipping absent tiers. It does not generate content and is unavailable after acceptance. The replacement remains in the same skill slot and the interaction is recorded. Do not create artificial families merely to enable this action.

Using 🔥 records the upgrade interaction but has no additional durable negative recommendation modifier. A higher family variant must have the same primary Skill as the slot; otherwise it is ineligible for the action.

## Standard Quest slots

Every Player has exactly three explicit Standard slots for each of eight skills: 24 total. A slot is uniquely identified by player, skill, and slot number 1–3 and points to its current PlayerQuest.

An AVAILABLE Standard quest has no deadline or penalty, persists across reloads, and does not auto-expire. It may be accepted, rerolled, or upgraded through 🔥 when eligible. Generating a Standard quest fills a slot; it never creates an untracked “25th quest.”

Phase 04 assigns slots lazily on first Standard-state access. Reconciliation preserves valid current offers and blocking quests, replaces only invalid AVAILABLE or unexpectedly terminal occupants, and never changes existing assignments after a Focus respec. Within a Skill slot, multi-Skill reward percentages give Focus and recommendation Catch-Up a meaningful weighted effect; these modifiers never change slot counts or XP.

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

The initial configurable failure penalty is 20% of snapshotted Base XP. For multi-skill quests, distribute that penalty over snapshotted rewarded Skills/percentages using largest remainder. Reduce Current Skill XP only and clamp every Skill at 0; never reduce Overall or Lifetime Skill XP. Expiration stores this calculated distribution without applying it until clear; abandonment applies it immediately. Immutable per-Skill detail records intended and actual applied XP; actual may be smaller because of the floor.

## Rerolls

Rerolls are free, unlimited, Standard-only, and only available before acceptance. A reroll replaces the current available quest, records history, excludes the old definition from the immediate selection context, does not permanently ban it, and prefers different activity/variety when practical.

Optional feedback: `TOO_HARD`, `NO_TIME`, `NOT_INTERESTED`, `JUST_DIFFERENT`. Generic reroll is weak negative; `NOT_INTERESTED` strongest; `TOO_HARD` suppresses harder content; `NO_TIME` favors shorter quests; `JUST_DIFFERENT` has little or no durable negative effect. Initial modifiers are in [RECOMMENDATION_ENGINE.md](RECOMMENDATION_ENGINE.md).

## Challenges

Daily and Weekly pools are independently generated. They may share a skill but the same QuestDefinition must not be simultaneously active in both pools for one player. Both require explicit acceptance, have no reroll or failure penalty, and use Easy/Medium/Hard/Epic definitions; Legendary is excluded. Unfinished quests become `EXPIRED` at window reset whether unaccepted or accepted-incomplete; `accepted_at` and progress preserve history.

New Challenge acceptance revalidates the current definition under the library lock: it must be active, approved, eligible for the assigned Daily/Weekly pool, non-Legendary, and have valid Skill/tag allocations, difficulty-band XP, descriptive text, duration, and completion target. A stale ineligible offer returns HTTP 409 `OFFER_CHANGED` before acceptance or snapshot writes. Previously accepted Challenges retain their snapshots and existing retry, completion, and expiration behavior after content retirement or editing.

### Daily

- Generate three Challenges in three unique skills.
- Focus/Catch-Up weighted and easier-biased than Standard.
- Initial configurable individual Challenge XP bonus: 10%.
- Reset at 12:00 AM player local time.
- Completing 3/3 grants an initial configurable +100 Overall-only Daily set bonus exactly once.

### Weekly

- Generate five Challenges in five unique skills.
- Focus/Catch-Up weighted and harder/value-biased relative to Daily.
- Initial configurable individual Weekly Challenge bonus: 15%.
- Reset Monday at 12:00 AM player local time.
- Completing 5/5 grants an initial configurable +300 Overall-only Weekly set bonus exactly once.

Initial configurable Daily weights are Easy 60%, Medium 30%, Hard 8%, Epic 2%, Legendary 0%. Initial configurable Weekly weights are Easy 30%, Medium 40%, Hard 25%, Epic 5%, Legendary 0%.

## Completion types

`SINGLE` requires target 1. `COUNT` requires target greater than 1. COUNT progress may increment or decrement after acceptance, is clamped to `[0, target]`, and awards no partial XP. Reaching target automatically and atomically completes and rewards the quest. Completed progress cannot be reduced. Duplicate/concurrent target operations cannot reward twice.

## Catch-Up

Rank skills by Current Skill Level, then Current Skill XP ascending. The single lowest Skill receives an initial configurable +10% Catch-Up XP bonus only when it is among a completed quest’s rewarded Skills. Apply the bonus to that Skill’s distributed XP share; it also contributes to Overall XP. Recommendation weighting remains separate: lowest 1.30, second 1.20, third 1.10, all others 1.00, combined by reward percentage for multi-skill quests. Focus and recommendation Catch-Up multiply and neither hard-excludes content.

If skills remain tied after Level and Current XP, resolve the single lowest Skill deterministically by FLOURISH Skill code ascending.

## Streaks

Streaks belong to skills. A streak advances or is maintained when at least one accepted Standard, Daily, or Weekly quest rewarding that skill completes during a local calendar day. Multi-skill completion qualifies every rewarded skill. Multiple completions in one skill/day count once. Abandoned, expired, and rerolled quests do not count. Missing one calendar day resets the streak; MVP has no grace/freeze.

There is no separate Daily-Challenge or Weekly-Challenge streak in Build 1. A Challenge completion participates only in the existing Player-by-Skill streak rows for the Skills it rewards; completing a full Challenge set does not advance another streak.

Initial configurable tiers:

| Current streak | Bonus |
|---|---:|
| 0–2 days | 0% |
| 3–6 | 5% |
| 7–13 | 10% |
| 14–29 | 15% |
| 30+ | 20% |

Determine the applicable tier after counting the current qualifying local calendar day. A completion establishing day 3 receives the 3-day +5% bonus. Evaluate the resulting tier independently for each rewarded Skill share.

## Timezone and reset rules

Store an explicit IANA timezone such as `America/Denver`. Daily boundaries are midnight local time; weekly boundaries are Monday midnight local time. Challenge records store fixed UTC `window_start_at`/`window_end_at`. A later timezone change affects future pools and future streak boundaries, never existing Challenge windows or Standard deadlines.

Use scheduled maintenance plus defensive lazy reconciliation. Correctness must not depend on cron alone.

Successful Challenge mutations lazily ensure the current Daily and Weekly sets required by their response, within the same Player-locked transaction as the action and any rewards. No prior pool GET is required after rollover. Expired-action reconciliation commits before returning `CHALLENGE_EXPIRED`; it does not require generating new pools or award rewards. Genuine transaction failures roll back the action and its response prerequisites together.
