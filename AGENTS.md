# FLOURISH Agent Instructions

FLOURISH is a gamified real-life progression system. The authoritative contracts are in [`docs/`](docs/); start with [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) and read the relevant subsystem documents before making changes.

## Non-negotiable rules

1. Read the relevant specifications before changing a subsystem. Existing FLOURISH specifications are authoritative.
2. Distinguish **PRODUCT RULE ambiguity** from an **IMPLEMENTATION DETAIL**. Make reasonable implementation-detail decisions consistent with the architecture; never invent product or game behavior. Stop and identify genuinely ambiguous product rules.
3. The server is authoritative for gameplay. Core gameplay must be available through reusable service and REST API boundaries; UI-only logic is not authoritative.
4. Important game transitions are transactional. Never allow partially applied XP, penalties, rewards, quest state, streak state, set bonuses, or slot replacement.
5. Design reward and penalty operations for idempotency and concurrency safety.
6. Put game-balance values in centralized, version-controlled configuration rather than scattering constants through application code.
7. Ordinary runtime quest selection uses the curated Quest Library and deterministic/configurable algorithms; it must not depend on an LLM call.
8. Runtime-selectable `QuestDefinition` records must be both `APPROVED` and `ACTIVE`.
9. Preserve backward compatibility with established data unless an explicit migration changes it.
10. Add or update tests whenever gameplay behavior changes, and run relevant tests before considering work complete.
11. Do not implement items in [`docs/BACKLOG.md`](docs/BACKLOG.md) without explicit instruction.
12. Prefer a simple modular monolith over premature services or infrastructure.
13. Never put secrets in source control or documentation. Use named placeholders only.
14. Do not rewrite unrelated working systems during scoped work.
15. Keep documentation synchronized when an approved implementation decision changes an authoritative contract.

When specifications appear to conflict, surface the conflict. Do not silently reinterpret a more specific rule. Product decisions marked **OPEN DECISION** require owner resolution before behavior depending on them is implemented.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
