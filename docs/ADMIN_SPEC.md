# Admin Specification

Status: authoritative Build 1 admin scope. Related: [content guide](QUEST_CONTENT_GUIDE.md), [data model](DATA_MODEL.md), [architecture](ARCHITECTURE.md).

## Goal and authorization

Provide a protected `/admin` area where authorized admins manage QuestDefinitions without direct database editing. Authentication uses the application identity boundary; the exact Build 1 admin authorization mechanism is an **OPEN DECISION**. It must be server-enforced and must not expose secrets.

## Required capabilities

- List, search, and filter QuestDefinitions.
- Create and edit a definition, skills/reward percentages, tags, eligibility, metadata, and optional family.
- Validate structural and content constraints.
- Submit for review, approve, or reject.
- Activate or deactivate.
- Inspect a QuestFamily’s difficulty progression and missing/duplicate tiers.
- Show actionable validation errors before state transitions.

## Review lifecycle

```text
DRAFT -> PENDING_REVIEW -> APPROVED
                      \-> REJECTED
REJECTED -> PENDING_REVIEW (after revision/resubmission)
APPROVED --gameplay-relevant edit--> PENDING_REVIEW
```

Only APPROVED definitions may be activated for runtime use; runtime additionally requires `active = true`. Deactivation need not change review state. A gameplay-relevant edit to an approved definition returns it to `PENDING_REVIEW` and prevents new selection until reapproved. Existing PlayerQuest snapshots and accepted gameplay remain unchanged.

**OPEN DECISION:** the exact list of gameplay-relevant versus metadata-only fields and whether an approved definition may remain active while pending rereview. The conservative product reading is that runtime requires current `APPROVED + ACTIVE`, so pending review makes it ineligible.

## Validation

Validation must cover all [data invariants](DATA_MODEL.md), approved taxonomy, Standard windows, SINGLE/COUNT targets, difficulty/XP bands, exactly one primary skill/tag, total reward percentage, eligibility, safety metadata, and family uniqueness. Validation must not silently repair content.

## Auditability

Important curator actions—creation, edits, submit, approve, reject, activate, deactivate—must identify actor, action, target, timestamp, and relevant before/after or change summary. The exact audit entity/schema and retention policy are an **OPEN DECISION**; they must be specified before admin implementation.

## Canonical seed data

Canonical quests and tags are version-controlled and seedable into a fresh database. Admin edits do not silently rewrite repository seed files. The synchronization/promotion workflow between database-curated changes and canonical seed data is an **OPEN DECISION**.

## Not Build 1

No AI quest-generation UI, team permission system, CSV import system, or sophisticated CMS. See [BACKLOG.md](BACKLOG.md).

