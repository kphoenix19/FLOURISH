# Canonical quest seeds

This is the future canonical location for version-controlled QuestDefinition seed files. Phase 02 defines and validates the concrete format and supplies real content; Phase 00B intentionally contains no fake quests.

Build 1 seed rules are authoritative in [`docs/QUEST_CONTENT_GUIDE.md`](../../../docs/QUEST_CONTENT_GUIDE.md): validate before persistence, use stable human-readable quest identifiers alongside database primary keys, upsert canonical definitions, and deactivate removed runtime content where appropriate rather than silently hard-deleting database rows. Direct admin database edits never rewrite these repository files automatically.
