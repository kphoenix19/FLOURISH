# FLOURISH

> Your real life is the game. FLOURISH is the progression system.

FLOURISH is a browser-based, gamified real-life progression system that rewards constructive actions with overall and life-skill progression. It is not a conventional to-do list. The MVP uses honor-system completion, a curated quest library, and server-authoritative gameplay.

The repository contains the authoritative specifications and the minimal Build 1 project foundation. Gameplay systems are intentionally deferred to later phases.

## Authoritative specifications

- [Product scope and experience](docs/PRODUCT_SPEC.md)
- [Gameplay rules and lifecycle](docs/GAME_RULES.md)
- [Domain/data model](docs/DATA_MODEL.md)
- [Recommendation Engine v1](docs/RECOMMENDATION_ENGINE.md)
- [Quest content and taxonomy](docs/QUEST_CONTENT_GUIDE.md)
- [Admin curation](docs/ADMIN_SPEC.md)
- [Build 1 acceptance criteria](docs/BUILD1_ACCEPTANCE.md)
- [Architecture and operations](docs/ARCHITECTURE.md)
- [Explicit non-goals and backlog](docs/BACKLOG.md)
- [Instructions for implementation agents](AGENTS.md)

Rules labeled **LOCKED MVP** are authoritative for Build 1. Values labeled **initial configurable value** belong in version-controlled configuration and may be tuned without redefining the underlying rule. Unresolved product behavior is labeled **OPEN DECISION**.

## Prerequisites

- Windows 10/11 (primary workflow; the application remains cross-platform)
- Node.js 22 or newer
- Corepack (included with supported Node distributions)
- Docker Desktop with Docker Compose for local PostgreSQL
- Git

No WSL installation is required.

## Local setup on Windows

Run these commands from the repository root in PowerShell:

```powershell
corepack enable
corepack pnpm install
Copy-Item .env.example .env
docker compose up -d postgres
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `GET /api/health` returns a small JSON response when the application is running.

Phase 01 includes the relational domain schema and the `establish_domain_model` migration. Docker runs PostgreSQL; Next.js runs directly on the Windows host.

The checked-in `.env.example` uses local-only development defaults. Replace `AUTH_SECRET` with a unique local value before authentication work and never commit `.env` files or real OAuth credentials.

## Verification commands

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
corepack pnpm test:e2e
```

The integration suite verifies real PostgreSQL constraints and requires `DATABASE_URL` to target a disposable local development/test database. It truncates only its test fixtures. The Playwright smoke test starts the development server automatically and requires a locally installed Chromium browser. Install it once with `corepack pnpm exec playwright install chromium` if needed.

## Database and seed commands

- `corepack pnpm db:generate` — generate the Prisma client.
- `corepack pnpm db:migrate` — create/apply a development migration after Phase 01 adds models.
- `corepack pnpm db:seed` — validate and transactionally import the canonical Phase 02 library.
- `corepack pnpm seed:validate` — validate canonical files without a database.
- `corepack pnpm seed:review` — show titles grouped by tag and possible duplicate-content candidates.
- `corepack pnpm db:studio` — open Prisma Studio.

Canonical Skills, tags, families, and 275 quests live in [`data/seeds/`](data/seeds/). Apply migrations with `corepack pnpm exec prisma migrate deploy` before `corepack pnpm db:seed`. Repeated imports preserve IDs and row counts, restore canonical values, and deactivate removed seed-managed content without deleting definitions or player history. Non-seed-managed key collisions fail for explicit operator resolution. Admin database edits do not rewrite files. See the [curator workflow](docs/QUEST_CONTENT_GUIDE.md#canonical-phase-02-library).
