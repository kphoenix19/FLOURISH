# FLOURISH

FLOURISH is a gamified personal development progression application. Players complete real-life quests, earn overall and Skill XP, and build streaks across eight areas: Fitness, Learning, Occupation, Us, Reflection, Investing, Stewardship, and Hobbies.

The application combines a curated quest library with persistent assignments, player-local Daily/Weekly Challenges, and rule-based recommendations. Completion is self-reported; the server owns quest transitions and reward calculations.

> **Measured performance improvement:** at 10,000 completed quests, recommendation recomputation fell from **560 ms to 63 ms median (89% lower latency)** in local PostgreSQL benchmarks. Standard reads and persisted recommendation hits improved by approximately **85?86%**, while preserving selection behavior and transaction safety. See the [performance engineering case study](docs/PORTFOLIO_SKILLS.md#9-measured-query-optimization-with-behavior-preservation) for the implementation, benchmark methodology, regression tests, and remaining limits.

## Screenshots

### Home dashboard

[![FLOURISH Home dashboard showing overall level and XP alongside active Standard quests and Daily/Weekly Challenges](docs/screenshots/home-dashboard.png)](docs/screenshots/home-dashboard.png)

### Quests and progression gallery

Select an image to view it at full size.

| Standard quests | Daily and Weekly Challenges |
| --- | --- |
| [![Expanded Fitness and Us Skill panels showing available and active quest slots with accept, complete, abandon, and reroll controls](docs/screenshots/standard-quests.png)](docs/screenshots/standard-quests.png) | [![Daily and Weekly Challenge completion meters with completed, available, and active quests and a COUNT progress indicator](docs/screenshots/daily-weekly-challenges.png)](docs/screenshots/daily-weekly-challenges.png) |

| Skill progression | Profile and Focus Points |
| --- | --- |
| [![Overview of all eight Skills with levels, active quest counts, streaks, and XP remaining to the next level](docs/screenshots/skill-progression.png)](docs/screenshots/skill-progression.png) | [![Player profile showing overall level, XP, timezone, Focus Point allocation, and links to settings and Skill progress](docs/screenshots/profile.png)](docs/screenshots/profile.png) |

## Key features

- **Google sign-in and onboarding:** Google OAuth, timezone selection, and allocation of Focus Points across eight Skills. Settings support timezone changes and free Focus reallocation.
- **Standard Quests:** three persistent slots per Skill; accept, reroll, increase difficulty within a quest family, complete, abandon, or clear an expired quest. Acceptance freezes quest values and starts a deadline.
- **Progression:** overall and Skill levels, integer XP allocation, Catch-Up bonuses, and Skill streaks. Expiration stores a Current Skill XP penalty; explicit clear applies it. Overall and Lifetime Skill XP are preserved on failure.
- **Daily/Weekly Challenges:** player-local windows, SINGLE completion, COUNT progress with no partial XP, and individual/set completion bonuses.
- **Recommendations:** a persisted suggestion from existing available Standard slots, weighted by Focus, difficulty fit, Catch-Up, variety, and interaction history.
- **Content administration:** protected quest search, creation, editing, review, activation/deactivation, stale-edit checks, and audit records. Only approved, active definitions are runtime-eligible.

These features are implemented. Future scope is tracked separately in the [backlog](docs/BACKLOG.md) and [Build 2 planning](docs/BUILD2_CHANGES.md).

## Engineering highlights

| Decision | Implementation evidence |
| --- | --- |
| Measure history growth and eliminate unnecessary query/materialization work | [Bounded per-Skill history queries](src/modules/quests/standard/history.ts) and [lazy loading](src/modules/quests/standard/context.ts) avoid full-history reads on persisted recommendation hits. [Before/after benchmarks](docs/PORTFOLIO_SKILLS.md#9-measured-query-optimization-with-behavior-preservation) include latency, SQL counts, and correctness evidence. |
| Serialize gameplay mutations for each player inside PostgreSQL transactions | [`standardContext` and `standardTransaction`](src/modules/quests/standard/context.ts) use a Player row lock and shared content-library locks. |
| Settle rewards once, including competing requests | [`resolveStandardQuest`](src/modules/quests/standard/resolution.ts) and [`mutateChallenge`](src/modules/challenges/service.ts) combine status checks, transactions, reward records, XP ledger entries, and slot/set updates. |
| Preserve acceptance-time facts and reward breakdowns | [`mutateStandardQuest`](src/modules/quests/standard/actions.ts) captures gameplay/text snapshots; [`QuestReward` and `QuestSkillReward`](prisma/schema.prisma) retain calculated reward details. |
| Keep progression arithmetic deterministic | [`allocateLargestRemainder` and `percentRoundHalfUp`](src/modules/progression/math.ts) conserve integer XP; [level calculations](src/modules/progression/levels.ts) use configured curves. |
| Enforce relational invariants as well as service validation | [Prisma models](prisma/schema.prisma) and [SQL migrations](prisma/migrations/) define foreign keys, composite uniqueness, CHECK constraints, and partial unique indexes. |
| Resolve identity and authorization on the server | [Session configuration](src/modules/auth/options.ts), [guards](src/modules/auth/guards.ts), and [API helpers](src/lib/api.ts) handle verified identity, role/ownership boundaries, same-origin JSON mutations, and structured errors. |
| Exercise behavior at multiple boundaries | [Unit tests](tests/unit/), [PostgreSQL integration tests](tests/integration/), [browser tests](tests/e2e/), and [CI](.github/workflows/ci.yml) cover calculations, UI state, transactions, authorization, and workflows. |

See [Portfolio engineering skills](docs/PORTFOLIO_SKILLS.md) for specific functions, test evidence, and tradeoffs.

## Technology stack

| Layer | Repository configuration |
| --- | --- |
| Runtime/package manager | Node.js 22+ required; CI uses Node 24. Locally verified: Node 24.22.1 and pnpm 11.25.0. |
| Application | Next.js 16.3.4, React 19.2.8, TypeScript 5.9.3 |
| Styling/validation | Tailwind CSS 4.3.3, Zod 4.5.4 |
| Authentication | NextAuth.js 4.24.15 (Auth.js), Google OAuth |
| Persistence | PostgreSQL 17, Prisma 7.10.0, PostgreSQL driver adapter |
| Testing | Vitest, React Testing Library, Playwright |
| Automation | Docker Compose for local PostgreSQL; GitHub Actions for CI |

Versions reflect the current [manifest](package.json) and [lockfile](pnpm-lock.yaml), not claims about the latest releases. Use the frozen lockfile for reproducible installs.

## Architecture

FLOURISH is a modular monolith: Next.js serves pages and REST routes, domain services implement gameplay, and Prisma persists state in PostgreSQL. Server-rendered pages call the same service layer used by API handlers. Browser mutations go through authenticated REST endpoints; the browser does not calculate authoritative rewards.

```mermaid
flowchart LR
  Browser[React browser UI] --> Pages[Next.js server pages]
  Browser --> API[Next.js REST handlers]
  Google[Google OAuth] <--> Auth[NextAuth session and guards]
  Auth --> Pages
  Auth --> API
  Pages --> Services[Domain services]
  API --> Services
  Job[Reconciliation command] --> Services
  Services --> Prisma[Prisma and pg adapter]
  Prisma --> DB[(PostgreSQL)]
```

[Architecture and operations](docs/ARCHITECTURE.md) documents transaction boundaries, lifecycle rules, authentication, and reconciliation.

## Local setup

### Prerequisites

Install Git, Node.js 24 (the CI runtime), Corepack, and Docker with Docker Compose and Linux-container support. On Windows, start Docker Desktop. The application runs directly on the host; only PostgreSQL runs in Docker.

The commands below use PowerShell and `corepack.cmd pnpm`, avoiding global pnpm shortcuts and PowerShell script-policy changes. On macOS/Linux use `corepack pnpm` and replace `Copy-Item` with `cp`. If Corepack is absent, install it using your Node installation's package manager before continuing. The repository pins pnpm 11.25.0.

### Environment and database

From a fresh checkout:

```powershell
git clone https://github.com/kphoenix19/FLOURISH.git
cd FLOURISH
Copy-Item .env.example .env
```

Skip cloning if already in the repository, and do not overwrite an existing `.env`. The ignored `.env` holds local configuration:

| Variable | Local value/purpose |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Docker database settings; the template supplies development-only defaults. |
| `DATABASE_URL` | `postgresql://REPLACE_WITH_USER:REPLACE_WITH_PASSWORD@localhost:5432/REPLACE_WITH_DATABASE?schema=public`; must match Docker settings. The template already matches its defaults. |
| `AUTH_SECRET` | `REPLACE_WITH_RANDOM_AUTH_SECRET`; generate a unique value below. |
| `AUTH_GOOGLE_ID` | `REPLACE_WITH_GOOGLE_CLIENT_ID` |
| `AUTH_GOOGLE_SECRET` | `REPLACE_WITH_GOOGLE_CLIENT_SECRET` |
| `NEXTAUTH_URL` | `http://localhost:3000` |

Generate an authentication secret and paste it into `.env`; never commit real secrets:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
docker compose up -d --wait postgres
corepack.cmd pnpm install --frozen-lockfile
corepack.cmd pnpm db:generate
corepack.cmd pnpm exec prisma migrate deploy
corepack.cmd pnpm db:seed
```

Seeding validates and transactionally imports [canonical content](data/seeds/). Repeat imports preserve IDs, restore seed-managed values, and deactivate removed content without deleting player history. Admin edits do not rewrite seed files; see the [curator workflow](docs/QUEST_CONTENT_GUIDE.md#canonical-phase-02-library).

### Google OAuth and startup

In Google Cloud Console, select your project and create a **Web application** OAuth client under **Google Auth Platform → Clients**. Configure Branding/Audience and test users as required. Register:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

Copy the client ID and secret into `.env`, then start the application:

```powershell
corepack.cmd pnpm dev
```

Open [localhost:3000](http://localhost:3000), sign in, and complete onboarding. Use the same hostname as `NEXTAUTH_URL`; a different port/hostname needs matching OAuth registrations. Restart after changing credentials. Without valid configuration, `/login` shows setup guidance. Builds and automated database tests do not require live Google credentials.

`GET /api/health` is an application liveness response, not a database readiness check. Use `docker compose ps` to check PostgreSQL and `docker compose stop` to stop it safely. Restart the terminal if newly installed CLIs are not found.

## Testing and CI

Run baseline checks from the repository root, stopping if a command fails:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
```

Integration tests use **only `TEST_DATABASE_URL`**, never the application's `DATABASE_URL` or `.env`. The harness accepts local PostgreSQL database `flourish_test` with the restricted `flourish_test` role, no URL query options, and an administrator-owned disposable-target marker. It rejects superusers, database owners, role memberships, and public-schema access before creating test schemas. Each suite migrates and resets its own random schema. Resets enumerate same-schema foreign-key dependencies with TRUNCATE RESTRICT; cross-schema dependencies and search-path drift are rejected. Cleanup validates ownership and external dependencies before dropping its schema. The constraint suite uses the same isolation and retains all constraint checks.

Start a fresh disposable instance (not the development Compose service). Replace both password placeholders consistently; URL-encode special characters in URLs:

```powershell
docker run --detach --rm --name flourish-tests --publish 127.0.0.1:55433:5432 --env POSTGRES_USER=postgres --env POSTGRES_PASSWORD=REPLACE_WITH_TEST_ADMIN_PASSWORD --env POSTGRES_DB=flourish_test postgres:17-alpine
docker exec flourish-tests pg_isready -U postgres -d flourish_test
```

After PostgreSQL is ready, provision it once and run tests:

```powershell
$env:TEST_DATABASE_ADMIN_URL = 'postgresql://postgres:REPLACE_WITH_TEST_ADMIN_PASSWORD@127.0.0.1:55433/flourish_test'
$env:TEST_DATABASE_URL = 'postgresql://flourish_test:REPLACE_WITH_TEST_PASSWORD@127.0.0.1:55433/flourish_test'
corepack.cmd pnpm exec tsx scripts/setup-test-database.ts
Remove-Item Env:TEST_DATABASE_ADMIN_URL
corepack.cmd pnpm test:integration
docker stop flourish-tests
```

Stop if provisioning fails. The provisioner rejects a nonempty database or an existing test role; use a fresh disposable instance rather than relaxing the checks. Test runs can repeat after successful provisioning without provisioning again. No manual migration/seed step is needed for integration tests. Do not change the normal application configuration. If a process is forcibly terminated before teardown, discard its disposable container; do not run manual cleanup against an application database.

| Test layer | Coverage |
| --- | --- |
| Unit/component | XP and level boundaries, allocation, streak/date rules, recommendation scoring, validation, and React loading/action/error behavior |
| PostgreSQL integration | Schema constraints, transactions and rollback, concurrent settlement, seed imports, onboarding, API authorization, admin audits, and reconciliation |
| Playwright | Public smoke checks and authenticated desktop/Pixel 7 viewport journeys for onboarding, settings, quest lifecycle, Challenges, and administration |

For authenticated browser tests, use a **separate fresh instance** named `flourish_e2e`. The application uses public tables there, so the restricted role is granted public-schema access only in this E2E database. Both server startup and fixture connections verify its dedicated E2E marker before any application or cleanup operation.

```powershell
docker run --detach --rm --name flourish-browser-tests --publish 127.0.0.1:55434:5432 --env POSTGRES_USER=postgres --env POSTGRES_PASSWORD=REPLACE_WITH_TEST_ADMIN_PASSWORD --env POSTGRES_DB=flourish_e2e postgres:17-alpine
docker exec flourish-browser-tests pg_isready -U postgres -d flourish_e2e
$env:TEST_DATABASE_ADMIN_URL = 'postgresql://postgres:REPLACE_WITH_TEST_ADMIN_PASSWORD@127.0.0.1:55434/flourish_e2e'
$env:E2E_DATABASE_URL = 'postgresql://flourish_test:REPLACE_WITH_TEST_PASSWORD@127.0.0.1:55434/flourish_e2e'
corepack.cmd pnpm exec tsx scripts/setup-test-database.ts --e2e
Remove-Item Env:TEST_DATABASE_ADMIN_URL
corepack.cmd pnpm exec tsx scripts/prepare-e2e-database.ts
corepack.cmd pnpm exec playwright install chromium
corepack.cmd pnpm test:e2e
docker stop flourish-browser-tests
```

Wait for readiness and stop on any command failure. Guarded preparation runs migrations and canonical seeding without changing the application `DATABASE_URL`. The [harness](playwright.config.ts) serves port 3103 and uses encrypted test sessions rather than live Google consent. Without `E2E_DATABASE_URL`, authenticated cases skip and the smoke-test server receives a nonfunctional test URL instead of inheriting application credentials. Screenshots/traces go to ignored `test-results/`; live OAuth still needs a manual check.

[GitHub Actions](.github/workflows/ci.yml) provisions a fresh PostgreSQL 17 service, runs the same guarded setup with temporary admin credentials, then runs integration tests using only the restricted role and `TEST_DATABASE_URL`. Public application migrations are no longer needed for the constraint suite. Frozen install, lint, types, unit tests, and production build remain in CI; Playwright is not part of that workflow. No application secrets are used.

## Operations and limitations

- `corepack.cmd pnpm jobs:reconcile` runs reconciliation manually. A deployed installation would need an external scheduler; the repository does not provision one. The command stores expirations and creates current Challenge sets without awarding XP or applying failure penalties.
- Completion uses the honor system; there is no external verification of real-world actions.
- Google is the only implemented login provider. Admin access requires an account with the `ADMIN` role; there is no role-management UI.
- Local setup and CI are provided; no public hosted demo or production deployment is documented here. Load capacity and production operational readiness have not been established by these tests.
- `db:migrate` creates development migrations; `db:studio` opens Prisma Studio. `seed:validate` checks content offline, and `seed:review` groups titles and flags possible duplicates. See [package scripts](package.json).

## Further documentation

- [Engineering competencies and evidence](docs/PORTFOLIO_SKILLS.md)
- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), and [game rules](docs/GAME_RULES.md)
- [Product scope](docs/PRODUCT_SPEC.md), [recommendations](docs/RECOMMENDATION_ENGINE.md), and [admin curation](docs/ADMIN_SPEC.md)
- [Quest content guide](docs/QUEST_CONTENT_GUIDE.md) and [acceptance criteria](docs/BUILD1_ACCEPTANCE.md)
- [Build 1 handoff](docs/BUILD1_DOCUMENTATION.md), [Build 2 planning](docs/BUILD2_CHANGES.md), and [backlog](docs/BACKLOG.md)
- [Contributor/agent instructions](AGENTS.md)

Phase documents retain implementation history and planning context. Read them alongside current code; future plans are not claims of delivered functionality.
