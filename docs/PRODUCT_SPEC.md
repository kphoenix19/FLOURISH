# Product Specification

Status: authoritative for Build 1. See also [game rules](GAME_RULES.md), [architecture](ARCHITECTURE.md), and [acceptance criteria](BUILD1_ACCEPTANCE.md).

## Product definition

**LOCKED MVP:** FLOURISH is a gamified real-life progression system whose philosophy is: **“Your real life is the game. FLOURISH is the progression system.”** It makes beneficial real-life actions rewarding, especially when they otherwise provide little immediate feedback. Players complete real-life quests, earn XP, level an overall character and individual life skills, build streaks, receive recommendations, and see neglected areas.

FLOURISH is not a conventional to-do list. Completion is self-reported on the honor system. There are no pay-to-win mechanics. AI may support offline candidate creation later, but ordinary runtime selection uses approved curated content and configurable algorithms without an LLM call.

## Canonical skill taxonomy

“FLOURISH” names the complete eight-skill system:

| Letter | Skill | Scope |
|---|---|---|
| F | Fitness | Physical health and fitness |
| L | Learning | Learning and upskilling |
| O | Occupation | Career and work |
| U | Us | Relationships and social connection |
| R | Reflection | Mindfulness, spirituality, religion, contemplation, and intentional rest |
| I | Investing | Finances and investing |
| S | Stewardship | Cooking, cleaning, organization, and care for the home |
| H | Hobbies | Fun, recreation, creativity, and personal interests |

Skill trees and subskills are not MVP.

## Core player journey

1. Sign in with Google and create a Player profile.
2. Select an IANA timezone and allocate all Focus Points.
3. Receive three persistent Standard Quest slots per skill (24 total).
4. Accept, reroll, or increase the difficulty of available Standard quests where allowed.
5. Complete accepted real-life quests or acknowledge failure through abandonment/expired clearing.
6. Gain overall and distributed skill XP, levels, and skill streaks.
7. Receive persisted “What Should I Do Next?” recommendations from existing available Standard slots.
8. Participate in Daily and Weekly Challenge pools.
9. Review progress and freely respec Focus Points.

## Focus Points

**LOCKED MVP:** onboarding allocates Focus Points across all eight skills. Initial total: **46**; minimum: **1** and maximum: **10** per skill; every point must be allocated. All three values are configurable. Balanced and min-max distributions are valid.

Focus affects recommendation weighting only. It does not affect XP, levels, or hard eligibility. Respec is free and unlimited in MVP. A new allocation affects future selections/recommendations, never accepted quests or historical rewards. Store both current allocation and allocation history.

Initial configurable recommendation modifiers:

| Points | Modifier | Points | Modifier |
|---:|---:|---:|---:|
| 1 | 0.70 | 6 | 1.10 |
| 2 | 0.75 | 7 | 1.20 |
| 3 | 0.80 | 8 | 1.30 |
| 4 | 0.90 | 9 | 1.40 |
| 5 | 1.00 | 10 | 1.50 |

## Player-facing surfaces

- Onboarding / FLOURISH Setup
- Home
- Skill Detail
- Quest Detail
- Challenges
- Profile / Progress
- Settings
- Protected internal Admin / Quest Curation

No separate Quest Log is required for MVP.

### Home hierarchy

1. Overall Level / XP progression
2. Active Quests
3. What Should I Do Next?
4. Daily / Weekly Challenges
5. FLOURISH Overview

### Skill Detail

Show skill level, XP, streak, Focus Points, Catch-Up state, and exactly three persistent Standard Quest slots. AVAILABLE actions are Accept, Reroll, and the harder-family action when applicable. ACCEPTED actions show deadline, Complete, and Abandon. EXPIRED shows its stored penalty and Clear Quest while continuing to block its slot.

Desktop uses sidebar navigation. Mobile uses bottom navigation for Home, Skills, Challenges, and Profile; Settings is reachable from Profile. No critical interaction may be hover-only.

## Product principles and boundaries

- Reward constructive actions, not socioeconomic advantage or outcomes outside player control.
- Good: move money into savings, complete a workout, prepare a balanced meal.
- Bad: save $10,000, earn a 10% return, lose 10 pounds.
- Exact base XP reflects real-world value/importance more than raw duration.
- Focus reflects player preference; Catch-Up gently balances neglected skills. Neither excludes content.
- Curated semantic variety matters more than textual variety.
- Configuration may tune starting values, but it may not violate locked invariants.

## MVP success boundary

Build 1 is complete only when the end-to-end and reliability requirements in [BUILD1_ACCEPTANCE.md](BUILD1_ACCEPTANCE.md) pass. Explicit exclusions are in [BACKLOG.md](BACKLOG.md).

