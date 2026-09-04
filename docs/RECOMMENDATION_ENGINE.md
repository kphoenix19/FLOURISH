# Recommendation Engine v1

Status: authoritative selection/scoring contract. See [game rules](GAME_RULES.md) and [quest content](QUEST_CONTENT_GUIDE.md).

## Purpose and boundaries

The engine selects from curated `APPROVED + ACTIVE` QuestDefinitions. It performs weighted random selection and does not call an LLM at runtime. No factor hard-excludes content unless an eligibility or lifecycle rule does.

Two distinct scores exist:

- **Quest Generation Score:** decides what fills a Standard slot; difficulty influence is full.
- **Home Recommendation Score:** chooses among already-generated AVAILABLE Standard quests; difficulty influence is light because generation already incorporated it. It never creates another quest.

Persist the Home recommendation and recalculate only when invalidated by meaningful state changes such as completion, reroll, acceptance, expiration, slot replacement, Daily reset, or Focus allocation change. Recalculation is non-critical/post-commit and must never roll back gameplay.

## Score and selection

```text
Score = DifficultyWeight
      × FocusModifier
      × CatchUpModifier
      × VarietyModifier
      × HistoryModifier
      × RandomnessModifier

P(Quest_i) = Score_i / sum(all eligible scores)
```

Use a seeded/persistently auditable random source where helpful for tests, but do not always select the maximum score. Candidate eligibility filtering occurs before scoring. If no eligible candidate exists, return a visible domain failure rather than invent content.

**OPEN DECISION:** exact lightweight difficulty coefficients for Home recommendations and how multiple applicable History modifiers compose (single strongest, most recent, or multiplicative). These need configuration before implementation.

## Focus modifier

Combine relevant skill modifiers using each QuestSkill reward percentage (weighted arithmetic mean). Initial point-to-modifier table is in [PRODUCT_SPEC.md](PRODUCT_SPEC.md). Focus affects recommendations/selections only.

Example structure, not a new rounding rule: for skill modifiers `m_s` and reward shares `p_s`, `FocusModifier = Σ(p_s × m_s) / 100`.

## Catch-Up modifier

Rank skills ascending by Current Skill Level then Current Skill XP. Initial values: rank 1 = 1.30; rank 2 = 1.20; rank 3 = 1.10; remaining = 1.00. Combine a multi-skill quest’s relevant values by reward percentage, then multiply by Focus.

Equal level-and-XP tie-breaking is an **OPEN DECISION**.

## Difficulty weighting

Initial configurable Standard generation weights by the level of the slot’s skill:

| Skill level | Easy | Medium | Hard | Epic | Legendary |
|---|---:|---:|---:|---:|---:|
| 1–10 | 60 | 25 | 10 | 4 | 1 |
| 11–25 | 45 | 30 | 17 | 7 | 1 |
| 26–50 | 30 | 30 | 25 | 12 | 3 |
| 51–75 | 20 | 25 | 30 | 20 | 5 |
| 76–100 | 15 | 20 | 30 | 25 | 10 |

All three slots use this distribution; there is no forced Easy slot. Difficulty is weighted, not level-gated. Daily must be easier-biased and Weekly harder/value-biased relative to Daily, but their exact distributions are **OPEN DECISION**.

## Variety modifier

Use occurrences of the primary variety tag among the last five completed activities in the relevant skill:

| Occurrences | Modifier |
|---:|---:|
| 0 | 1.00 |
| 1 | 0.95 |
| 2 | 0.90 |
| 3 | 0.85 |
| 4 | 0.80 |
| 5 | 0.75 |

For a Standard slot, “relevant skill” is the slot’s skill. **OPEN DECISION:** how the variety factor is combined across multiple rewarded skills in non-slot selection contexts.

## History modifier

Use roughly the last 20 relevant interactions. Initial configurable values:

| History signal | Modifier / behavior |
|---|---|
| None | 1.00 |
| Recently completed similar | 0.95 |
| Generic reroll | 0.90 |
| `JUST_DIFFERENT` | 0.98 |
| `NO_TIME` | 0.90, stronger relevance for longer quests |
| `TOO_HARD` | 0.85, stronger relevance for harder quests |
| `NOT_INTERESTED` | 0.75 |
| Recently abandoned similar | 0.85 |
| Recently expired similar | 0.90 |

“Similar,” recency decay/window, and the strength functions for duration/difficulty are **OPEN DECISION**. Until resolved, implementations may store the required signals but must not invent durable personalization semantics.

## Randomness

Initial configurable random multiplier is approximately 0.90–1.10. Weighted selection must be testable statistically and deterministically under a seeded source.

## Reroll selection context

Exclude the rerolled QuestDefinition from the immediate/current selection context and prefer different variety where practical. This is temporary, not a permanent ban. Record the interaction and optional feedback reason.

## Challenge selection constraints

- Daily: three definitions in three unique skills; easier-biased; no Legendary.
- Weekly: five definitions in five unique skills; harder/value-biased relative to Daily; no Legendary.
- Pools are independent, but the same definition cannot be simultaneously active in both for one player.
- Apply Focus/Catch-Up weighting and applicable variety/history factors without turning them into hard exclusions.

## Player explanation and internal observability

Player-facing chips may say: `Matches your Focus`, `Skill needs attention`, `Something different`, or `Matches your experience`. Never expose raw coefficients or formulas. Internal debug logs may capture factors, candidate IDs, selected ID, config version, and invalidation reason, subject to bounded retention outside an unlimited PostgreSQL log.

