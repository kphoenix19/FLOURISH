# Quest Content Guide

Status: authoritative curation guide. Data and admin workflow are in [DATA_MODEL.md](DATA_MODEL.md) and [ADMIN_SPEC.md](ADMIN_SPEC.md).

## Runtime and curation policy

Runtime uses a curated Quest Library; normal selection requires no LLM. AI may later propose candidates, but a human curator must approve them. Only `APPROVED + ACTIVE` definitions may be selected.

Target the initial seed at approximately 30–35 baseline definitions per skill. During initial MVP seed generation only, cap definitions under any single primary variety tag at 10. This is a content-generation guardrail, not a permanent gameplay rule.

Semantic uniqueness outranks wording changes. Ask: **“Would the player perceive this as meaningfully different to do?”** If not, consolidate. Do not use vague “general” buckets to pad the library.

## Definition checklist

Every definition has exactly one primary skill, up to two secondary skills, and reward percentages totaling 100%; exactly one primary variety tag and up to two secondary variety tags; a difficulty and base XP consistent with configured bands; an active-minute estimate; completion type/target; eligible pools; safety and review metadata; and either a 24/48/72-hour Standard window when Standard-eligible or an appropriate non-Standard value per the data contract.

Use QuestFamily only for natural difficulty progression. At most one variant per difficulty; missing tiers are allowed. A family variant intended for 🔥 should preserve the slot’s skill relationship.

XP represents constructive real-world value/importance more than duration. Reward actions under the player’s control, not wealth, health, returns, or other outcomes. Avoid pay-to-win and socioeconomic advantage.

## Variety taxonomies

| Skill | Approved tags |
|---|---|
| Fitness | `strength`, `cardio`, `walking`, `mobility`, `recovery`, `nutrition`, `sports`, `health_maintenance`, `fitness_learning`, `general_fitness` |
| Learning | `reading`, `coursework`, `practice`, `research`, `project`, `review`, `problem_solving`, `learning_planning` |
| Occupation | `productivity`, `planning`, `career_growth`, `job_search`, `interviewing`, `networking`, `leadership`, `career_planning`, `work_organization`, `entrepreneurship` |
| Us | `friends`, `family`, `dating`, `partner`, `communication`, `community`, `group_activity`, `social_growth`, `relationship_maintenance` |
| Reflection | `meditation`, `mindfulness`, `journaling`, `gratitude`, `self_reflection`, `prayer`, `spiritual_practice`, `spiritual_learning`, `spiritual_community`, `rest` |
| Investing | `budgeting`, `saving`, `investing`, `spending`, `debt`, `income`, `financial_planning`, `financial_organization`, `financial_learning` |
| Stewardship | `cooking`, `meal_prep`, `dishes`, `cleaning`, `decluttering`, `organization`, `laundry`, `home_maintenance`, `home_improvement`, `cooking_learning` |
| Hobbies | `creative`, `gaming`, `music`, `outdoors`, `collecting`, `building`, `entertainment`, `exploration`, `social_hobby`, `hobby_learning` |

The only approved general tag is `general_fitness`. Do not invent `general_learning`, `general_occupation`, `general_reflection`, `general_investing`, `general_stewardship`, or `general_hobbies`; improve or remove vague content.

## Skill-specific philosophy

### Fitness

Use general physical-health actions. Nutrition quests must intentionally represent healthy/balanced choices. Ordinary cooking is Stewardship. Avoid diagnosis/treatment and outcome-based health quests.

### Learning

Require intentional acquisition or application of knowledge/skill. Passive consumption is not automatically Learning; building and applying knowledge may be high-value.

### Occupation

Reward intentional professional progress beyond baseline employment. “Go to work for 8 hours” is not a quest. Entrepreneurship belongs here.

### Us

Reward intentional actions that build, maintain, or improve meaningful connection. Communication is one tag; avoid endless micro-variations of conversation prompts.

### Reflection

Include awareness, contemplation, gratitude, mindfulness, spiritual/religious practice, and intentional rest. Do not require denomination configuration. Repeated rerolls can reduce unwanted content naturally.

### Investing

Encourage financial awareness, organization, learning, stability, and constructive habits. Never prescribe dollar amounts to invest, specific investments, expected returns, personalized financial advice, or tax advice. Financial outcomes never determine XP.

### Stewardship

Use discrete intentional actions caring for home, belongings, food, and environment. Small chores are valuable; “Clear the sink” is legitimate.

### Hobbies

Treat intentional recreation, creativity, exploration, and enjoyment as valuable without productivity justification. More entertainment time is not inherently more valuable/difficult; trying something new may be more valuable than extending a familiar session.

## Safety and quality review

Curators must check agency, accessibility, socioeconomic neutrality, medical/financial boundaries, meaningful distinctness, tag validity, realistic completion window, reward distribution, XP/difficulty rationale, and family coherence.

Build 1 curation metadata values are `CostLevel`: `NONE`, `LOW`, `MODERATE`, `HIGH`; `SocialRequirement`: `NONE`, `OPTIONAL`, `REQUIRED`; and `SafetyCategory`: `GENERAL`, `FITNESS`, `FINANCIAL`, `SPIRITUAL`. These describe content and are not player eligibility gates in Build 1.

Repository seed files are canonical: validate before persistence, use stable human-readable identifiers plus database primary keys, upsert definitions, and deactivate removed runtime content where appropriate rather than silently hard-deleting it. Admin database edits do not automatically rewrite seed files.

## Canonical Phase 02 library

The content source is [`data/seeds/`](../data/seeds/): `skills.json`, `variety-tags.json`, `quest-families.json`, and `quests/{fitness,learning,occupation,us,reflection,investing,stewardship,hobbies}.json`. Do not duplicate quest rows in Markdown. The typed schema, validator, report, and persistence modules live in `src/modules/quests/seed/`; `prisma/seed.ts` is the importer entry point.

Initial counts: 8 Skills, 76 Variety Tags, 15 families, 275 definitions. Fitness 34, Learning 33, Occupation 36, Us 34, Reflection 34, Investing 34, Stewardship 35, Hobbies 35. Occupation's distinct baseline concepts are retained despite the approximate 30–35 target. No primary tag exceeds six definitions. Communication has five distinct single actions plus one weekly repetition quest. There are 246 SINGLE and 29 COUNT definitions (89.5% / 10.5%), 233 single-Skill and 42 two-Skill definitions (84.7% / 15.3%), and no forced three-Skill content. Pool eligibility: Standard 246, Daily 157, Weekly 193. These distributions are guidance, not runtime constraints.

### Curator workflow

1. Add/edit a JSON row. Preserve its stable key when revising the same behavior; titles are not identity. Family keys and Skill-plus-tag codes are also stable identities.
2. Run `pnpm seed:validate` without database access. It checks strict types, complete locked Skill/tag taxonomies and references, configured XP bands/windows, completion targets, pools, family tiers and primary Skill coherence, allocations, review/deprecation metadata, and the initial ten-per-primary-tag guardrail. Invalid values fail rather than being coerced. Use `corepack pnpm` if needed on Windows.
3. Run `pnpm seed:review` for titles grouped by primary tag, including Us/communication, and deterministic title-similarity candidates. Duplicate normalized titles within a Skill and identical normalized action descriptions within Skill/completion target fail validation. Token-overlap candidates are review hints only; strings cannot prove semantic uniqueness. Manually review agency, safety, distinctness, estimates, and family progression.
4. Run `pnpm test`, apply migrations using `pnpm exec prisma migrate deploy`, then import with `pnpm db:seed`. Only persistence requires `DATABASE_URL`. `pnpm test:integration` requires a disposable test database: the Phase 01 suite truncates public fixture tables; Phase 02 tests create, migrate, and remove their own random schema.

### Persistence and ownership

The complete dataset validates before writes. One PostgreSQL transaction upserts all canonical content and reconciles definition joins in batches. A transaction-scoped advisory lock serializes seed runs. Library table locks protect ownership checks from concurrent admin writes; reads and runtime history tables remain available. Failure rolls everything back. Repeated imports preserve IDs, counts, and canonical values; mutable `updated_at` timestamps record import touches. Review dates come from files, not each run's clock.

`seed_managed` records repository ownership on QuestDefinition, QuestFamily, and VarietyTag. Its migration defaults existing rows to false. A canonical key colliding with a non-owned definition, family, or tag fails the entire import for explicit operator resolution. Naming conventions never establish ownership. The eight fixed Skills are always canonical.

Present canonical rows regain file values, review metadata, Skills/percentages, and Variety Tags. No canonical ContextTags are defined: present definitions regain an empty ContextTag allocation without deleting ContextTag records. Missing owned definitions, families, and tags become inactive; non-owned content is untouched. Definitions are never deleted. Removed definitions retain their joins and family membership. PlayerQuests, accepted snapshots, rewards, and all runtime history remain untouched. Reintroducing a key with `active: true` reactivates its original row.

For explicit deprecation in the files, set `active: false` and supply `deprecationReason`. Removing the row instead deactivates it on the next seed. **Removed family members still reserve their difficulty tier**, since the existing unique constraint also covers inactive definitions. Revise the same key for the same behavior. To replace a behavior with a new key, retain the old row as explicitly deprecated with `familyKey: null` in that import. Present canonical memberships are released and rebuilt transactionally, allowing valid tier swaps. Never delete or silently repurpose history to bypass a conflict.

### Initial content decisions and review notes

- Owner correction: `L-WEEK-03` is HARD at 275 XP; its original MEDIUM label conflicted with the bands.
- Fitness/Learning retain the supplied baseline rewards, estimates, windows, pools, and allocations. Weekly COUNT rows use null Standard windows and estimated total active minutes across the set; challenge deadlines come from runtime pool windows. Missing exact values for the other baseline concepts use conservative choices within the bands. No Legendary content was manufactured.
- The problem-solving definitions describe related but distinct actions, so no forced PROBLEM_SOLVING family is seeded. The other 15 families follow specified natural progressions. Gaming is not a duration family.
- Overlapping Us group/community/social concepts were consolidated. Friend/family check-ins distinguish asynchronous outreach from synchronous time. Relationship actions call for safe, welcome interaction and respect for boundaries. Weekly repetition adds no conversation micro-variations.
- “Review 3 Planned Purchases Before Buying” appears once, as weekly COUNT. Finance content contains no prescribed security, required amount, promised return, or tax advice. Transfers/payments depend on affordability after essential needs. XP rewards action, not outcomes.
- Fitness contains no weight-loss outcomes or medication/supplement directives. Exercise permits appropriate intensity and rests. Spiritual content remains voluntary and denomination-neutral. Outdoor Hobbies do not automatically reward Fitness, and passive entertainment duration does not automatically raise difficulty.
- `reviewedAt` is the fixed initial repository curation date and `reviewed_by` stays null; no human identity is fabricated. Value scores use a coarse 1–5 scale from approachable actions to substantial milestones; reasons describe effort/follow-through. These are metadata, not a selection algorithm. `NONE` cost assumes available resources; food preparation and optional transfers/payments use `LOW` without dollar thresholds. Explicit interpersonal actions use `REQUIRED`, solo actions `NONE`, and adaptable sports `OPTIONAL`. Metadata never gates eligibility.

Continue manually reviewing overlap across tags/Skills and accessibility of conditional finance, relationship, and physical activities. Automated validation cannot guarantee content quality. No Phase 02 product decision remains open; Build 1 XP level curves are resolved in `GAME_RULES.md` and version-controlled configuration.
