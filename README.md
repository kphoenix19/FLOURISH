# FLOURISH

> Your real life is the game. FLOURISH is the progression system.

FLOURISH is a browser-based, gamified real-life progression system that rewards constructive actions with overall and life-skill progression. It is not a conventional to-do list. The MVP uses honor-system completion, a curated quest library, and server-authoritative gameplay.

The repository contains the complete Build 1 MVP: canonical content, Google-compatible authentication and onboarding, Standard quests, progression and Skill streaks, persisted recommendations, Daily/Weekly Challenges, admin curation, and scheduled/manual reconciliation.

## Authoritative specifications

- [Consolidated Build 1 baseline and Build 2 planning handoff](docs/BUILD1_DOCUMENTATION.md)
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
corepack pnpm exec prisma migrate deploy
corepack pnpm db:seed
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `GET /api/health` returns a small JSON response when the application is running.

Docker runs PostgreSQL; Next.js runs directly on the Windows host. Use `docker compose ps` to confirm PostgreSQL is healthy and `docker compose stop` to stop services safely. If `docker` is not found after installing Docker Desktop, restart the terminal so its CLI path is refreshed.

The checked-in `.env.example` uses local-only development defaults. Replace `AUTH_SECRET` with a unique local value before authentication work and never commit `.env` files or real OAuth credentials.

## Verification commands

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm jobs:reconcile
```

The integration suite requires `DATABASE_URL` to target a disposable local test database. The Playwright suite requires `E2E_DATABASE_URL` to target a separate migrated and seeded disposable database; this enables all authenticated desktop and Pixel 7 tests. Install Chromium once with `corepack pnpm exec playwright install chromium` if needed.

## Database and seed commands

- `corepack pnpm db:generate` — generate the Prisma client.
- `corepack pnpm db:migrate` — create/apply a development migration after Phase 01 adds models.
- `corepack pnpm db:seed` — validate and transactionally import the canonical Phase 02 library.
- `corepack pnpm seed:validate` — validate canonical files without a database.
- `corepack pnpm seed:review` — show titles grouped by tag and possible duplicate-content candidates.
- `corepack pnpm db:studio` — open Prisma Studio.

Canonical Skills, tags, families, and 275 quests live in [`data/seeds/`](data/seeds/). Apply migrations with `corepack pnpm exec prisma migrate deploy` before `corepack pnpm db:seed`. Repeated imports preserve IDs and row counts, restore canonical values, and deactivate removed seed-managed content without deleting definitions or player history. Non-seed-managed key collisions fail for explicit operator resolution. Admin database edits do not rewrite files. See the [curator workflow](docs/QUEST_CONTENT_GUIDE.md#canonical-phase-02-library).

## Google sign-in and onboarding

Phase 03 uses stable Auth.js/NextAuth.js 4.24.15 with Google only. The implementation follows the [v4 server-session interface](https://next-auth.js.org/configuration/nextjs) and [Google provider setup](https://next-auth.js.org/providers/google). Supply these values in an ignored local `.env` file:

```dotenv
DATABASE_URL=REPLACE_WITH_POSTGRESQL_CONNECTION_URL
AUTH_SECRET=REPLACE_WITH_RANDOM_AUTH_SECRET
AUTH_GOOGLE_ID=REPLACE_WITH_GOOGLE_CLIENT_ID
AUTH_GOOGLE_SECRET=REPLACE_WITH_GOOGLE_CLIENT_SECRET
NEXTAUTH_URL=http://localhost:3000
```

Generate a unique secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and put it only in the ignored environment file. Do not use the example placeholder as a real secret. Missing/placeholder OAuth configuration shows setup guidance at `/login`; a build does not require credentials.

Create a Google Cloud OAuth client of type Web application, configure its consent screen/test users as needed, set the authorized JavaScript origin to `http://localhost:3000`, and register the exact redirect URI **`http://localhost:3000/api/auth/callback/google`**. Use the same hostname in the browser and `NEXTAUTH_URL`; for another host/port, update both Google registrations and `NEXTAUTH_URL`. Production must use the deployed HTTPS origin and its corresponding callback. No Google credentials are entered in the app UI.

Apply migrations, run `db:seed`, start the app, then open `/login` and choose **Continue with Google**. First sign-in creates/reuses a User, links its Google account, and ensures one Player. The Player starts with an unset timezone and incomplete onboarding. `/onboarding` introduces the database-loaded Skills, asks for an IANA timezone (with an explicit device-timezone shortcut), offers the balanced 6/6/6/6/6/6/5/5 Focus default, and confirms the choices. Completion atomically persists all eight Focus rows/history, initializes missing progression and streak state, and opens `/home`.

Initial history records `old_focus_points = null`. Settings respecs are free/unlimited and record only changed Skills under one change ID; saving the same allocation adds no history. Matching onboarding retries succeed without resets; differing completed-state retries return 409 and direct the player to Settings. `/settings` changes timezone without rewriting existing history. `/profile` summarizes progress and links to Settings. `/admin` provides guarded quest curation but no role-editing UI. Matching emails are not automatically merged across identities; an `OAuthAccountNotLinked` error needs explicit administrator investigation.

Identity endpoints are `GET /api/me`, `POST /api/onboarding/complete`, `PUT /api/me/focus`, and `PUT /api/me/timezone`; gameplay and curation routes live under `/api/quests`, `/api/challenges`, `/api/recommendations`, and `/api/admin`. Onboarding accepts `{ "timezone": "America/Denver", "focus": [{ "skillCode": "F", "points": 6 }, ...] }` with exactly eight unique Skills. Identity and admin role always come from the session. Browser mutations require same-origin JSON and reject client User/Player IDs or roles.

## Authentication tests without Google

`corepack pnpm test` runs domain/component tests. Set `DATABASE_URL` to a disposable migrated database for `corepack pnpm test:integration`. Phase 03 tests migrate an isolated random schema and cover real transactions, rollback, history, adapter collisions, authorization, and REST handlers. Never run the full integration suite against a valuable database: the existing Phase 01 constraint tests truncate public fixture tables.

For browser coverage, set `E2E_DATABASE_URL` to a disposable migrated and seeded database, then run `corepack pnpm test:e2e`. The harness starts a dedicated server at `http://127.0.0.1:3103`, generates a temporary auth secret, and mints normal Auth.js encrypted session cookies for test-owned User fixtures. There is no application login bypass or test endpoint. Desktop Chromium and a phone-sized Chromium viewport cover onboarding through Settings and sign-out. Screenshots/traces are saved in ignored `test-results/`. Without `E2E_DATABASE_URL`, authenticated tests are skipped explicitly and the public smoke tests still run. Live Google consent and callback verification remain a manual configuration check.

## Build 1 gameplay and operations

An onboarded player’s first visit to `/home` or `GET /api/quests/standard` creates and populates three persistent Standard slots for each of the eight Skills. Reloads return the same assignments. The Home cards use `GET /api/quests/standard` and three same-origin JSON mutations: `POST /api/quests/standard/:playerQuestId/accept`, `/reroll`, and `/bump`. Accept and bump bodies are `{}`; reroll accepts optional `{ "feedbackReason": "TOO_HARD" }` using the documented feedback enum.

Acceptance starts the definition’s exact 24/48/72-hour elapsed deadline and freezes its gameplay and offer-text snapshots. Reroll and bump retain history and return the replacement assignment. Accepted Standard quests can complete or be abandoned; overdue quests expire lazily and apply their stored penalty only after explicit clear. Resolution atomically updates XP, levels, Skill streaks, immutable reward/ledger history, and the slot replacement. Identity always comes from the Auth.js session.

Home recommendations point only to existing eligible Standard slots and remain stable until invalidated. Daily and Weekly Challenges use fixed player-local windows, explicit acceptance, no-penalty expiration, atomic COUNT progress, configured bonuses, and exactly-once set bonuses. Challenge completions advance only ordinary per-Skill streaks.

Run `corepack pnpm jobs:reconcile` manually or hourly through an external scheduler. It uses the same Player locks and domain reconciliation as lazy request-time fallback. It never applies penalties, clears failures, awards XP, advances streaks, or generates recommendations.
