# Canonical quest seeds

These eight JSON files are the canonical Build 1 QuestDefinition library. Edit the declarative rows directly. Skills, tags, and families live in the parent directory. See the [curation workflow](../../../docs/QUEST_CONTENT_GUIDE.md#canonical-phase-02-library) for validation, review, persistence, and deprecation.

Build 1 seed rules are authoritative in [`docs/QUEST_CONTENT_GUIDE.md`](../../../docs/QUEST_CONTENT_GUIDE.md): validate before persistence, use stable human-readable quest identifiers alongside database primary keys, upsert canonical definitions, and deactivate removed runtime content where appropriate rather than silently hard-deleting database rows. Direct admin database edits never rewrite these repository files automatically.
