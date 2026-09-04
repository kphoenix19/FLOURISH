# Build 1 Acceptance Criteria

Status: authoritative release gate. Behavior details are in [game rules](GAME_RULES.md), [data model](DATA_MODEL.md), and [architecture](ARCHITECTURE.md).

## End-to-end player capability

A fresh environment with canonical version-controlled seed/config data supports a new player who can:

- [ ] Sign in using Google OAuth and receive/create a separate Player profile.
- [ ] select a valid IANA timezone, allocate exactly 46 Focus Points with 1–10 per skill, and complete onboarding.
- [ ] receive exactly 24 persistent Standard Quest slots: three for each FLOURISH skill.
- [ ] reload/return later without regeneration or loss of game state.
- [ ] reroll an AVAILABLE Standard quest and receive a persisted replacement with interaction history.
- [ ] use 🔥 when an approved active higher family variant exists, including a missing-tier skip.
- [ ] accept a Standard quest and receive its accepted snapshots and 24/48/72-hour deadline.
- [ ] complete it and immediately receive correct Overall XP, distributed Skill XP, Lifetime Skill XP, derived levels, qualifying streak updates, immutable ledger rows, and a replacement in the same slot.
- [ ] accept and abandon another quest, immediately receive only the configured Current Skill XP penalty, and receive a replacement.
- [ ] let an accepted Standard quest expire, see its stored unapplied penalty and blocked slot, and incur no penalty merely by loading the application.
- [ ] clear the expired quest, apply its stored penalty once, and receive a replacement.
- [ ] see a persisted Home recommendation selected only from existing AVAILABLE Standard slots, with safe reason chips and no 25th quest.
- [ ] receive three Daily Challenges in unique skills and five Weekly Challenges in unique skills, with no simultaneous same-definition overlap across the two pools.
- [ ] explicitly accept and complete SINGLE Challenges.
- [ ] increment/decrement accepted COUNT Challenges and automatically complete atomically at target without partial XP.
- [ ] receive configured Daily/Weekly Challenge XP bonuses and full-set Overall-only bonuses exactly once.
- [ ] build Skill streaks using local calendar-day boundaries, including every rewarded skill on a multi-skill completion.
- [ ] freely respec all Focus Points with history recorded and only future recommendation/selection affected.
- [ ] use all critical workflows at desktop and phone-sized responsive layouts without hover-only controls.

## Admin capability

An authorized administrator can list/search/filter, create/edit/validate, submit, approve/reject, activate/deactivate QuestDefinitions, and inspect family progressions. Unauthorized users cannot use admin capabilities. Gameplay-relevant edits return approved content to review. Runtime never selects content lacking both APPROVED state and ACTIVE state. Important curator actions are auditable.

## Reliability and concurrency gates

- [ ] Duplicate completion cannot duplicate rewards or XP.
- [ ] Duplicate abandonment cannot duplicate a penalty.
- [ ] Expired clear cannot apply a stored penalty twice.
- [ ] Concurrent COUNT target updates cannot reward twice or exceed the target.
- [ ] Daily/Weekly set bonuses cannot award twice.
- [ ] Concurrent slot replacement cannot create conflicting current quests.
- [ ] Completion versus abandonment/expiration races resolve to one valid terminal path.
- [ ] Critical transaction failure leaves no partial quest, reward, XP, level, streak, bonus, or slot state.
- [ ] Lazy reset reconciliation produces the same durable state as scheduled reconciliation and is retry-safe.
- [ ] Recommendation calculation failure does not roll back committed gameplay.

## Automated verification expectations

Unit, integration, API, and end-to-end tests cover the workflows above. At minimum test boundary XP values, all reward splits after the rounding decision is resolved, every status transition, timezone/DST boundaries, all streak tiers, every level band, all feedback modifiers, eligibility filtering, family-tier skipping, and invalid/duplicate/concurrent requests.

Build 1 cannot be accepted while any gameplay-affecting **OPEN DECISION** in the authoritative docs remains unresolved.

