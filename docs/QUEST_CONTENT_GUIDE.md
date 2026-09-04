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

Curators must check agency, accessibility, socioeconomic neutrality, medical/financial boundaries, meaningful distinctness, tag validity, realistic completion window, reward distribution, XP/difficulty rationale, and family coherence. Exact enum values for `cost_level`, `social_requirement`, and `safety_category` are an **OPEN DECISION** and must be defined before schema/seed implementation.

