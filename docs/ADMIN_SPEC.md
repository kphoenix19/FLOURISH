# Admin Specification

Status: authoritative Build 1 admin scope. Related: [content guide](QUEST_CONTENT_GUIDE.md), [data model](DATA_MODEL.md), [architecture](ARCHITECTURE.md).

## Goal and authorization

Use a simple User role model with `PLAYER` and `ADMIN`. The protected `/admin` area and every admin mutation endpoint require server-enforced `ADMIN` authorization; hiding UI alone is insufficient.

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

Gameplay-relevant fields include difficulty, Base XP, completion type/target/window, rewarded Skills/percentages, eligibility, family membership, and any input affecting promised reward or selection. Editing one moves the definition to `PENDING_REVIEW`, making it runtime-ineligible even if its active flag remains true. Pure curator notes and similarly non-gameplay metadata may be edited without rereview; the implementation must keep this whitelist narrow and explicit.

## Validation

Validation must cover all [data invariants](DATA_MODEL.md), approved taxonomy, Standard windows, SINGLE/COUNT targets, difficulty/XP bands, exactly one primary skill/tag, total reward percentage, eligibility, safety metadata, and family uniqueness. Validation must not silently repair content.

## Auditability

Persist important curator actions—creation, edits, submit, approve, reject, activate, deactivate—in a lightweight AdminAudit record containing actor User, action, entity type, entity identifier, timestamp, and structured before/after metadata where useful. This is an audit trail, not event sourcing.

## Canonical seed data

Repository seed files are canonical. Validate them before persistence, use stable human-readable quest identifiers alongside database keys, and upsert canonical definitions. Seeding must not silently hard-delete existing definitions; content removed from canonical runtime selection becomes inactive where appropriate. Direct admin database edits never rewrite repository seeds automatically; deliberate repository changes are required to promote them into canonical data.

## Build 1 implementation contract

The curator UI lists QuestDefinitions with server-side text search, filters, and pagination. Filters cover rewarded Skill, difficulty, family, review state, active state, eligible pool, and seed/admin ownership. The editor exposes the Build 1 definition, reward, taxonomy, eligibility, family, review, and safety fields. It also shows every selected family's occupied and missing difficulty tiers.

All curation REST endpoints independently require an authenticated `ADMIN` session and strict same-origin JSON mutation requests. Request DTOs use an explicit allowlist; clients cannot assign ownership, review state, activation, reviewer, or audit fields through the definition editor. Create, edit, submit, approve, reject, activate, and deactivate execute with their audit record in one serializable transaction. Edit and transition requests carry the last observed `updated_at`; stale requests fail with a conflict instead of overwriting newer work.

Admin-created definitions use `seed_managed = false`, begin `DRAFT + INACTIVE`, and retain stable human-readable keys. Seed-managed definitions display a warning that database edits do not change repository JSON and can be overwritten by a later canonical import. Build 1 offers no hard-delete operation: deactivation preserves accepted snapshots and runtime history.

Definition saves enforce structural validation, configured difficulty XP bands, SINGLE/COUNT targets, Standard windows, at least one eligible pool, 1–3 unique rewarded Skills with exactly one primary and a 100% total, and 1–3 unique controlled Variety Tags with exactly one primary. Every selected tag must belong to a rewarded Skill. Family/difficulty uniqueness is checked transactionally and remains backed by the database constraint.

## Not Build 1

No AI quest-generation UI, team permission system, CSV import system, or sophisticated CMS. See [BACKLOG.md](BACKLOG.md).
