# FLOURISH Performance, Bottleneck & Risk Audit

Audit date: **2026-10-26 (America/Denver)**. Audited commit: **`84e91ef800801521483056be77515066a8e0324f`**.

Scope: audit only. Application source, tests, dependencies, schemas, and configuration were not edited. This report is the only intentional repository change. Test/build tools produced ignored output. No commit or push was performed. Database writes were confined to a newly created, disposable PostgreSQL container with no existing volumes attached.

## 1. Executive summary

FLOURISH is responsive on this local machine with a small player history, and its existing transactional protections are substantial. **174 unit tests and 111 PostgreSQL integration tests passed**, along with lint and a production build. Completion, penalty clearing, overlapping rewards, and Challenge set bonuses have useful concurrency coverage. No cross-account access, SQL injection, duplicate reward settlement, or credential disclosure vulnerability was demonstrated.

Nevertheless, this revision should receive corrections before being presented as a release-ready public application. Five P1 findings cover vulnerable dependency versions and four reproduced gameplay availability/content-control defects. The database work also grows with completion history even when a persisted recommendation is reusable.

| Priority | Findings | Meaning in this audit |
|---|---:|---|
| P0 — Critical | **0** | No confirmed critical exploit or severe corruption established |
| P1 — High | **5** | Address before release-ready publication/deployment |
| P2 — Medium | **8** | Meaningful correctness, scaling, or operational risks; conditions specified below |
| P3 — Low | **2** | Optional, evidence-backed optimizations |
| Total | **15** | Dependency advisories are grouped into one project finding, not counted individually |

Measured warm production HTTP Home latency was **120 ms median / 161 ms p95**, versus Profile **8 ms / 15 ms**. The first Home request, including lazy population and cold server work, took **924 ms** in one observation. These are loopback measurements, not browser paint times or production capacity claims.

The important scaling result is a Standard-state service read rising from **45 ms to 288 ms median** when a synthetic player's completion history grows from zero to 10,000 rows. Recommendation recomputation rose from **55 ms to 525 ms**. A warm Home service load executed **136 SQL statements**, including transaction/lock statements; its three services repeatedly load overlapping state.

### Top 5 Recommended Actions

1. **A01:** Update and verify the vulnerable dependency graph, prioritizing Next.js, its Sharp dependency, and Zod. Distinguish advisory applicability from version matches.
2. **A02:** Treat “no available recommendation” as a valid Home state so accepted/expired quests remain accessible.
3. **A03:** Revalidate Challenge content at acceptance; never accept newly retired or unapproved definitions.
4. **A04:** Make Challenge mutations independent of whether the current Daily/Weekly response sets have already been generated.
5. **A05:** Preserve access to accepted Challenges across timezone changes and resolve the precise transition policy with the owner.

Estimated effort for these five actions, including focused regression tests and dependency verification: **5–8 engineering days**, excluding owner-decision delays. This is an implementation estimate, not an approved work plan.

## 2. Baseline and methodology

### Repository and runtime

| Item | Observed baseline |
|---|---|
| HEAD | `84e91ef800801521483056be77515066a8e0324f` — Public GitHub Portfolio Documentation |
| Initial working tree | Clean (`git status --porcelain=v1` produced no output) |
| Recent fixes reviewed | F1 `7efaf14`; F2 `61476cf`; F3 `e8334a8`; integration CI `4755db0` |
| Host | Windows, OS release `10.0.26200`, Intel Core i7-12700KF, 20 logical CPUs, approximately 47.9 GiB RAM |
| Runtime/tools | Node `24.22.1`; pnpm `11.25.0`; npm CLI `11.19.1`; Docker `29.9.2` |
| Installed application packages | Next.js `16.3.4`; React `19.2.8`; next-auth `4.24.15`; Prisma `7.10.0`; pg `8.23.0`; Zod `4.5.4` |
| Test tooling | Vitest `4.0.18`; existing Playwright configuration |
| Audit PostgreSQL | `17.11`, `postgres:17-alpine`, Linux musl, accessed from Windows over loopback port `55439` |
| Audit isolation | New container `flourish-audit-20261026`; no persistent existing volume; separate `audit_measure` schema for measurements/reproductions |
| Database model | Six repository migrations; canonical seed: 8 Skills, 76 Variety Tags, 15 families, 275 definitions |
| Local configuration | `.env` exists and is ignored; expected database/OAuth/session variables are set; configured application DB target is loopback. Values were not recorded. |
| Inherited test environment | `DATABASE_URL` and `E2E_DATABASE_URL` initially unset in the shell; explicitly overridden for every database test command |
| Existing application | A separate `next dev` process was already using this checkout on port 3000. It was not stopped or used for testing. |
| Next configuration | Empty configuration object; dynamic player pages; JSON service responses use `Cache-Control: no-store` |

Specifications reviewed: `PRODUCT_SPEC`, `ARCHITECTURE`, `GAME_RULES`, `DATA_MODEL`, `ADMIN_SPEC`, `RECOMMENDATION_ENGINE`, acceptance criteria, Build 2 changes, and backlog boundaries. Installed Next.js production and Route Handler guides were consulted. No backlog features were implemented or proposed as requirements.

Investigation covered server pages, client components, route composition, session/authorization boundaries, Standard/Challenge/progression/recommendation services, schema/indexes/migrations, importer/admin operations, reconciliation, tests, and CI. Queries and transactions were inspected directly, not inferred from React code.

### Executed checks

| Check | Result |
|---|---|
| `pnpm test` | **174/174 passed**, 17 files; Vitest reported 3.70 s |
| `pnpm test:integration` | **111/111 passed**, 5 files; 85.67 s, only against disposable PostgreSQL |
| `pnpm lint` | Passed, zero permitted warnings |
| `pnpm build` | Passed; approximately 5.12 s command wall time; 414 ms compilation, 1,427 ms TypeScript, 131 ms static-page generation in this cached run |
| Repository migrations | All six applied successfully to the disposable DB |
| Canonical imports | Clean and repeated imports executed; existing suite also verified ownership, rollback, IDs, deactivation and concurrent import behavior |
| `pnpm audit --prod --json` | Completed with vulnerability exit status: **25 advisories — 3 critical, 8 high, 11 moderate, 3 low** |
| Playwright suite | **Not executed successfully**: web-server setup stopped because an existing `next dev` process owns this checkout. No browser test pass is claimed. |
| Authenticated production HTTP | Temporary `next start` on `127.0.0.1:3104`, disposable user and process-only test OAuth/session values; removed after measurement |
| HTTP access checks | Anonymous `/api/admin` and `/api/quests/standard`: 401; ordinary authenticated user `/api/admin`: 403 |

Initial sandbox runs of Vitest, Prisma, Next's TypeScript worker, and Playwright failed with `spawn EPERM`; approved reruns were used. The first registry audit failed to fetch; its approved rerun succeeded. These environment failures are not application defects. `npm.ps1` was blocked by PowerShell policy; the `.cmd` CLI reported its version. Hardware was read using Node's OS API after CIM access was denied.

Service harnesses ran from in-memory stdin through the existing `tsx/cjs` loader, without adding benchmark files or dependencies. They asserted the disposable host/port/database, used real Prisma services and a separate schema, and attached Prisma query-event logging. One initial mutation-timing loop exhausted the three slots in its chosen Skill and stopped with a harness `TypeError`; its incomplete mutation sample was discarded. Corrected mutation measurements used all 24 slots and completed successfully. Earlier completed read measurements from that run remain valid.

## 3. Performance measurements

### Method and datasets

- Sequential samples, no intentional load generator; the existing development process remained present but was not exercised by the audit.
- Service fixtures used UTC, a fixed `2026-10-26T18:00:00Z` clock, and injected randomness `0.5`. Focus allocation was 6 for F/L/O/U/R/I and 5 for S/H.
- Baseline read player: 24 Standard offers, 3 Daily and 5 Weekly Challenges, no completed quests. A persisted recommendation was warmed before cache-hit timing.
- Mutation samples: 10 Standard acceptances followed by 10 completions; 10 separate Challenge players with one SINGLE acceptance/completion each. Setup work was outside each timed mutation.
- History fixtures: one different player, 24 current Standard offers, plus 1,000 and then 10,000 synthetic COMPLETED Standard rows with normalized Skill snapshots. These rows intentionally model query cardinality, **not a fully reconciled historical XP ledger**. No claims about ledger verification or real user behavior derive from them.
- HTTP fixtures: one fresh onboarded player on the seeded disposable public schema, normal encrypted Auth.js session, loopback production server. No real OAuth provider was called.
- Median is the middle observation (average of the two middle values for even samples). p95 uses nearest rank, `ceil(0.95*n)`. With 30 samples these tails are exploratory, not reliable production percentiles. No p95 is reported for fewer than 30 samples.
- SQL counts include BEGIN/COMMIT, locks, and relation queries emitted by Prisma; fixture setup is excluded. HTTP query counts were not instrumented.

### Service timings

| Operation | n | Median ms | p95 ms | SQL statements per operation |
|---|---:|---:|---:|---:|
| Initial Home service sequence, including lazy population | 1 | 517.93 | — | 656 |
| Warm Home: Standard + recommendation + Challenges | 30 | 112.02 | 127.06 | 136 |
| Standard state, no completions | 30 | 45.14 | 67.51 | 55 |
| Persisted recommendation hit, no completions | 30 | 44.15 | 55.77 | 54 |
| Recommendation recomputation, no completions | 30 | 54.63 | 62.56 | 66 |
| Warm Challenge state | 30 | 18.00 | 22.82 | 27 |
| Profile summary | 30 | 2.57 | 12.33 | 5 |
| Standard expiration reconciliation, no work due | 30 | 22.01 | 26.71 | 26 |
| Standard acceptance | 10 | 35.38 | — | 41 |
| Standard completion, including replacement | 10 | 67.59 | — | 85–90 |
| Challenge SINGLE acceptance | 10 | 19.09 | — | 27 |
| Challenge SINGLE completion | 10 | 31.52 | — | 44 |
| Clean canonical import | 1 | 752.16 | — | 478 |
| Repeat canonical import | 3 | 519.24 | — | 478 |

The first Home measurement is one cold-path observation, not a statistically established median distribution. The full scheduled job was exercised by integration tests, including overlap/idempotency, but was not timed at population scale. The no-op Standard reconciliation row is one component of that job, not an estimate of full job throughput.

### Completion-history scaling

| Operation | Completed rows | n | Median ms | p95 ms | SQL count |
|---|---:|---:|---:|---:|---:|
| Standard state | 1,000 | 30 | 70.45 | 82.44 | 55 |
| Standard state | 10,000 | 30 | 287.69 | 307.37 | 55 |
| Persisted recommendation hit | 1,000 | 30 | 69.42 | 82.39 | 54 |
| Persisted recommendation hit | 10,000 | 30 | 280.68 | 304.37 | 54 |
| Recommendation recomputation | 1,000 | 30 | 102.99 | 112.20 | 66 |
| Recommendation recomputation | 10,000 | 30 | 525.36 | 573.59 | 66 |

The statement count stays constant while row transfer, relation materialization, and application filtering grow. The measurements do **not** isolate the precise CPU/network/deserialization contribution. They do establish that a cache hit still pays history-dependent work.

Five simultaneous Standard reads for the same 10,000-history player finished in approximately **284, 557, 836, 1,141, and 1,433 ms**. Total burst duration was 1,433 ms, consistent with intentional Player-row serialization. This was one bounded burst, not a load/capacity test; different players can run concurrently except where library writes intervene.

### Representative EXPLAIN

Executed only in the disposable schema after `ANALYZE`:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM player_quests
WHERE player_id = :audit_player_id AND status = 'COMPLETED'
ORDER BY completed_at DESC, id ASC;
```

At 10,000 matching rows out of 10,170 total PlayerQuests, PostgreSQL chose a sequential scan and quicksort:

- Scan: 10,000 matching rows; 170 removed; approximately 0.91 ms to finish scanning.
- Sort: approximately 2.44–2.73 ms, 2,989 KiB memory.
- Shared buffers: 364 hits; planning 0.073 ms; total execution **3.142 ms**.

This is the root history query, not the complete multi-query Prisma operation. A sequential scan is reasonable for this highly concentrated fixture. **This plan does not establish that adding an index alone solves A07.** Returning all history is the dominant design issue. The schema already has Player/status, pool/status, deadline, window, FK and interaction-history indexes. A bounded per-Skill history query should be designed first, then its index and plan measured against a multi-player dataset.

### Production HTTP timings

Response bodies were fully consumed. Times include session/database work and, for pages, server rendering; exclude browser execution/paint and WAN/TLS effects. Body sizes are uncompressed byte lengths observed by the harness.

| Endpoint/page | n | Median ms | p95 ms | Response bytes |
|---|---:|---:|---:|---:|
| `/home`, first access | 1 | 923.99 | — | 92,918 |
| `/home`, warm | 30 | 119.99 | 161.32 | 92,918 |
| `/api/recommendations/next`, warm | 30 | 47.00 | 59.83 | 402 |
| `/api/quests/standard`, warm | 30 | 48.34 | 56.20 | 20,984 |
| `/api/challenges`, warm | 30 | 21.01 | 24.56 | 4,323 |
| `/profile` | 30 | 8.36 | 15.26 | 11,762 |
| `/settings` | 30 | 9.20 | 13.04 | 40,690 |

### Production bundle inventory

Unique JavaScript files referenced by each route's `entryJSFiles` plus `rootMainFiles`, from the completed production build:

| Route | JS chunks | Raw bytes | Sum of individually gzipped bytes |
|---|---:|---:|---:|
| Home | 9 | 899,378 | 239,907 |
| Profile | 7 | 495,883 | 146,617 |
| Settings | 9 | 882,717 | 236,193 |
| Admin library | 8 | 500,551 | 148,407 |

These are manifest-derived inventories, not measured browser transfer or exclusive route sizes. Shared runtime chunks overlap; polyfill fallback, CSS, HTML/RSC, browser caching and compression negotiation are outside these totals. A shared Home/Settings chunk is **379,667 bytes raw / 86,979 gzip** and contains Zod. Client components import `gameConfig`, whose module imports Zod and validates the full configuration at module load (A14). No exact “Zod-only” byte attribution or main-thread cost was established.

## 4. Confirmed bottlenecks

**History materialization under locks (A07)** and **repeated state/reconciliation work (A08)** are measured, not hypothetical. They affect Standard reads and mutations, recommendations, Home, and scheduled Standard expiration. Profile's narrow summary query is comparatively inexpensive.

The Player lock is a correctness mechanism: it prevents lost updates across multi-Skill rewards and penalties. Removing it or simply wrapping Home's three services in `Promise.all` is not a safe fix. Work should be reduced inside the serialized region, and shared read/reconciliation state reused where transaction boundaries permit.

**Content writes block gameplay reads (A09).** A controlled transaction took the same `SHARE ROW EXCLUSIVE` library locks as the importer. A Standard read waited with PostgreSQL `wait_event_type='Lock'`, `wait_event='relation'`. The lock was held for an intentional 150 ms before rollback; the read finished after 287 ms total. This is a lock-compatibility demonstration, not an import latency distribution. A real repeat import held its transaction for approximately 519 ms median locally; a slower deployment or larger library can extend the blockage.

Other reviewed constraints:

- `assertOnboardingIntegrity` rereads Player, Skills, Focus, overall progress, Skill progress and streaks on gameplay entry; callers then fetch some of those rows again.
- `reconcileInTransaction` builds a Standard response that its caller may discard, then rebuilds or rereads the state. Initial population additionally rereads current slots while assigning each of 24 offers. These are bounded per-slot repeated queries, not an unbounded N+1 on arbitrary user rows.
- The scheduled job pages Players in batches of 50, but processes Players and the two subsystems serially. It runs full Standard context initialization even for no-op expiration, and has two extra recommendation counts per Player. Population-scale runtime remains unmeasured.
- `getDb` is lazy and globally reused within a process, avoiding per-request client creation. It does not explicitly configure pool capacity, connection acquisition deadlines, or database statement/lock timeouts. Installed `pg-pool` defaults to 10 connections; deployment replicas multiply that budget. No pool leak or actual exhaustion was demonstrated.
- Progression thresholds use polynomial formulas and bounded/binary level search; eight-Skill calculations are small. No evidence supports replacing these with caches or background computation.
- Challenge generation loops over bounded 3/5 selections; admin list results are paginated to at most 100. Full eligible library loads and admin reference data still grow with library size, but the current 275-definition library did not establish a separate bottleneck.

## 5. Risky code execution inventory

| Operation and exact entry point | Scope / safeguards | Residual concern |
|---|---|---|
| Standard `resolveStandardQuest`, [resolution.ts:98](../src/modules/quests/standard/resolution.ts#L98) | Player/library locks; reward, progression, ledger, streak and replacement in one transaction; unique reward per quest | Replacement/content failure intentionally rolls back completion. Preserve atomicity; reduce context cost. COUNT gap is A06. |
| Passive Standard expiration, [resolution.ts:20](../src/modules/quests/standard/resolution.ts#L20) | Stores penalty facts, never silently debits XP; clear applies stored details once | F3 commit-before-error works; runtime balance-version issue A11 |
| Abandon cleanup, [resolution.ts:114](../src/modules/quests/standard/resolution.ts#L114) | Removes the temporary EXPIRED interaction for the same quest inside the abandonment transaction | Scoped deletion, not arbitrary history purge |
| Challenge `mutateChallenge`/`complete`, [service.ts:59](../src/modules/challenges/service.ts#L59), [service.ts:68](../src/modules/challenges/service.ts#L68) | Player lock; completion and set bonus transactional; terminal status and uniqueness prevent a second reward | A03–A05 and A10; response generation can roll back otherwise-valid mutation |
| Admin `updateQuest`, [service.ts:68](../src/modules/admin/service.ts#L68) | Strict DTOs, server admin guard, stale timestamp, serializable retry, audit in same transaction; deletes/recreates only definition joins | No public hard-delete endpoint; retry loop bounded to 3; global library-write contention |
| Canonical `persistCanonicalSeed`, [persist.ts:5](../src/modules/quests/seed/persist.ts#L5) | Validates first; advisory lock; table locks; explicit seed ownership; 120 s transaction timeout; join replacement atomic | A09; owned content may intentionally overwrite curator changes; missing owned definitions deactivated, not hard-deleted |
| Constraint test hooks, [database-constraints.test.ts:60](../tests/integration/database-constraints.test.ts#L60) | Require nonempty DATABASE_URL | Unqualified `TRUNCATE ... CASCADE`; no actual isolation guard, A12 |
| Other integration fixtures | Random schema; migrations applied within it; fixture truncation and schema drop | Safe only with intended schema/permissions; audit used disposable server regardless |
| E2E fixture cleanup, [standard-quests.spec.ts:13](../tests/e2e/standard-quests.spec.ts#L13) | Deletes reward/details/ledger/interactions for recorded fixture users, then users | Destructive but scoped; still requires dedicated E2E database |
| User/Player cascades, [schema.prisma:158](../prisma/schema.prisma#L158), [schema.prisma:441](../prisma/schema.prisma#L441) | Several game rows cascade; reward/penalty/history references also use RESTRICT | Manual account deletion is not a universal safe erase operation; dependent RESTRICT rows can block it. No user-delete application route found. |
| SQL in runtime services | Tagged parameterized Player IDs; literal lock/advisory statements | No unsafe raw SQL, shell execution, eval, or client-controlled SQL identifier path found |
| Job reconciliation, [reconciliation.ts:17](../src/modules/jobs/reconciliation.ts#L17) | Bounded paging; independent per-Player/subsystem transactions; bounded batch input | Pre/post recommendation counts are outside per-stage catches and can abort the run; job logs only error class. Not reproduced as a distinct failure. |
| Request parsing, [api.ts:13](../src/lib/api.ts#L13) | Authentication precedes parsing; origin/JSON checks; post-read size limit | A13: reads complete body before rejecting oversized content |

No destructive command or expensive load was directed at the existing application database. The audit's direct definition changes, synthetic history inserts, and intentional lock transaction existed only in disposable fixtures.

## 6. Security and data integrity findings

### Protections verified or supported by code/tests

- Production routes resolve identity from the verified server session, then apply user/player/onboarding/admin guards. Resource lookups bind to that Player. Real HTTP checks confirmed 401/403 behavior; integration tests cover ownership and forged identity inputs.
- JWT session resolution refreshes role and Player state from the DB, so role is not trusted solely from a stale client token. Google sign-in checks verified email; dangerous email account linking is disabled; provider credentials are not persisted by the adapter.
- Mutation parsing checks Origin against configured `NEXTAUTH_URL`, rejects cross-site fetch metadata and non-JSON content. Most DTOs are strict; Challenge and Standard-resolution bodies are parsed but ignored rather than strictly validated. Ignored identity fields do not become authority.
- Error responses suppress raw Prisma/connection details. Authentication logs omit provider metadata. No runtime shell/eval or unsafe SQL construction was found in reviewed application code.
- `.env` is ignored; only `.env.example` is tracked. Targeted current-tree key/token-pattern checks and history checks for `.env`/private-key filenames returned no matches. This was **not** a comprehensive entropy-based scan of every Git blob.
- Standard and Challenge rewards remain at most once under tested races. The important newly reproduced issues concern allowed transitions, visibility, rollback and retry semantics, not demonstrated double payment.

### Dependency advisory triage (A01)

The registry reported 25 advisories in the production dependency graph. Package-manager critical severity is **not** proof of a reachable P0 in FLOURISH. The following applicability checks matter:

| Affected dependency | Evidence and applicability |
|---|---|
| Next `16.3.4` + Sharp `0.35.4` | Registry matches image-optimization RCE; upstream describes a glibc Linux condition and Sharp `>=0.35.5` / Next `>=16.4.1` fix. Audited application host is Windows and audit DB image is musl; neither proves safety of a future Linux application deployment. No upload flow, `next/image` import or remote-image configuration was found; no exploit was attempted. [Upstream advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw). |
| Next `16.3.4`, `next/og` | ImageResponse RCE affects attacker-controlled SVG generation. No `next/og`/ImageResponse use found. Version match, no demonstrated application path. [Advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j). |
| Next Server Actions | DoS advisory requires a Server Action. Build's server-reference manifest contained zero Node and zero Edge actions; no `use server` source found. Condition absent in this revision. [Advisory](https://github.com/advisories/GHSA-p3m5-59mp-jv5r). |
| Next cache / metadata / dev-server advisories | Registry also flags cache poisoning/leaks, typed-array `use cache` RCE, metadata route access, dev MCP disclosure and optimizer SSRF. No `use cache`/Draft Mode or metadata image route found; player pages force dynamic rendering. Dev-server exposure and actual deployment optimizer configuration were not penetration-tested. [Typed-array advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [optimizer SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4). |
| Zod `4.5.4` | High-severity collection validation resource exhaustion, fixed at `4.6.6` according to the registry/advisory. API bodies are capped after reading, and collection DTOs have length constraints; process exhaustion was not demonstrated. Update and test boundary rejection. [Advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). |
| `source-map-js 1.2.1` | Indexed-source-map event-loop DoS; registry fix `>=1.2.2`. Path includes Next/PostCSS; no untrusted source-map application input found. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). |
| Prisma tooling's optional dependency paths | Registry flags lodash `4.17.21` (code injection/prototype pollution), deepmerge-ts `7.1.5` (recursive merge exhaustion), mysql2 `3.15.3` (credential/protocol issues), and fast-uri `3.1.7` (normalization/confusion issues). Paths run through Prisma Studio/config/dev tooling, not FLOURISH's PostgreSQL gameplay client imports. They still ship in the resolved graph and require triage; not all are request-reachable runtime vulnerabilities. |

Advisory information was retrieved on the audit date. Use a supported patched release meeting the cited minima, refresh the frozen lockfile deliberately, rerun the audit and regression suite, and verify deployment contents. Do not equate a caret range in `package.json` with the version already fixed in `pnpm-lock.yaml`.

### Reproduced defect scenarios

The following calls used the real services and migrated disposable database, not mocks. Setup uses the canonical seed, an onboarded UTC Player, fixed Monday `2026-10-26T18:00:00Z`, and randomness `0.5`.

1. **A02 — no recommendation:** Populate Standard slots, accept each of the 24 current quests through `mutateStandardQuest`, then call `getHomeRecommendation`. Result: `NO_RECOMMENDATION_CANDIDATE`, 24 accepted quests remain stored. `PlayerHome` catches this and fails its `state && recommendation && challenges` render gate, removing the only normal quest-action surface.
2. **A03 — retired Challenge:** Generate pools; change an AVAILABLE Daily quest's definition to `PENDING_REVIEW`, `active=false`; invoke `mutateChallenge(..., "accept")`. Result: **ACCEPTED**. The acceptance branch snapshots the current unapproved definition without checking approval/activation/eligibility. Definition restored afterwards in the fixture.
3. **A04 — reset rollback:** Generate Monday pools and accept a SINGLE Weekly quest. Advance injected time to Tuesday `2026-10-27T18:00:00Z`, without calling a pool read/job. Complete the still-valid Weekly quest. Result: Prisma **P2025**, quest still **ACCEPTED**, **zero rewards** because current Daily-set lookup fails while constructing the response. Call `getChallengeState` at Tuesday time, retry completion: **one reward** commits. Existing transactions prevent partial rewards, but the service incorrectly needs a prior read.
4. **A05 — timezone visibility:** Generate UTC pools, accept a Weekly quest, save `America/Denver`, then read pools at the same instant. Result: set count **2 → 4**, old quest still ACCEPTED but absent from returned Daily/Weekly quests. Its original fixed window is preserved in storage; the UI cannot see it. Original Daily end was `2026-10-27T00:00Z`, new Daily end `2026-10-27T06:00Z`.
5. **A06 — Standard COUNT:** Canonical library currently has **zero** approved/active Standard COUNT definitions, but admin/seed/domain validation allows them. In a disposable valid offer, set COUNT target 3, accept, then invoke Standard complete. Result: **COMPLETED**, `currentProgress=0`, `completionTargetSnapshot=3`, **one reward**. No Standard increment/decrement route exists. This requires eligible COUNT content, not a forged player reward payload.
6. **A10 — COUNT retry semantics:** Accept a Challenge COUNT target 3. Execute two identical increment calls, representing a retried delivery. Result: progress **2/3**. There is no operation identity/expected-progress field to distinguish retry from a new user action. This is **not** a duplicate-reward finding: terminal reward deduplication still works.
7. **A13 — body buffering:** Feed `payload` a synthetic same-origin JSON Request stream containing sixteen 65,536-byte whitespace chunks. Result: `PAYLOAD_TOO_LARGE`, but **all 1,048,576 bytes** were consumed first. No real endpoint was flooded.

### F1–F3 review

| Fix | Assessment |
|---|---|
| F1: stale Home progression after Challenge completion | Existing UI regressions passed. `challengeAct` refreshes Standard state and recommendation after complete/increment. Preserve this behavior; only skip redundant refreshes when authoritative mutation results prove no relevant state changed. Network-failure/cross-action response ordering was not browser-verified. |
| F2: partial Home loading failure | Existing Home tests passed; the rendering gate prevents a partial model. A02 is a **separate uncovered valid empty-recommendation case** made inaccessible by the all-required gate. Do not simply undo the fix: add an explicit valid empty state while preserving true error handling. |
| F3: late Standard expiration rollback | Both single/multi-Skill regressions passed, including stored penalty, zero reward, subsequent clear and one-time application. Expired marker exits the transaction normally and error is thrown after commit. No regression in this path found. A04 is a different Challenge response-construction rollback path. |

## 7. Prioritized findings table

“Before release” means before advertising this revision as release-ready. Source-only publication with explicit known-issue disclosure is not equivalent to operating a public service.

| ID | Priority | Classification / category | Exact principal location and function | Before release? | Estimated effort |
|---|---|---|---|---|---|
| A01 | P1 | Confirmed vulnerable versions; exploitability conditional / security | [package.json:31](../package.json#L31), [package.json:37](../package.json#L37), [pnpm-lock.yaml:20](../pnpm-lock.yaml#L20); dependency resolution | Yes | 0.5–1 day plus compatibility contingencies |
| A02 | P1 | Reproduced defect / availability | [recommendations/service.ts:26](../src/modules/recommendations/service.ts#L26), [home/page.tsx:14](../src/app/home/page.tsx#L14); `getHomeRecommendation`, `PlayerHome` | Yes | 0.5 day |
| A03 | P1 | Reproduced defect / curation integrity | [challenges/service.ts:68](../src/modules/challenges/service.ts#L68); `mutateChallenge` acceptance | Yes | 0.5–1 day |
| A04 | P1 | Reproduced defect / transaction availability | [challenges/service.ts:69](../src/modules/challenges/service.ts#L69); `getStateInTransaction` called by `mutateChallenge` | Yes | 0.5–1 day |
| A05 | P1 | Reproduced defect / timezone lifecycle | [challenges/service.ts:31](../src/modules/challenges/service.ts#L31), [service.ts:69](../src/modules/challenges/service.ts#L69), [player/services.ts:99](../src/modules/player/services.ts#L99); `ensureSet`, `getStateInTransaction`, `updateTimezone` | Yes; owner transition-policy resolution | 1.5–3 days |
| A06 | P2 | Reproduced conditional defect / COUNT integrity | [standard/resolution.ts:62](../src/modules/quests/standard/resolution.ts#L62), [admin/domain.ts:24](../src/modules/admin/domain.ts#L24); Standard `complete`, `questInputSchema` | Before enabling Standard COUNT; disclose existing gap | 1–2 days |
| A07 | P2 | Measured scaling issue / DB and backend | [standard/context.ts:23](../src/modules/quests/standard/context.ts#L23), [recommendations/service.ts:29](../src/modules/recommendations/service.ts#L29); `standardContext`, `getHomeRecommendation` | Before scale/history claims; not source-publication blocker | 1–2 days |
| A08 | P2 | Measured excess work / DB and frontend | [standard/slots.ts:56](../src/modules/quests/standard/slots.ts#L56), [slots.ts:59](../src/modules/quests/standard/slots.ts#L59), [standard-quests.tsx:35](../src/components/standard-quests.tsx#L35); reconciliation and `acceptRecommendation` | No; high-value next optimization | 1–2 days |
| A09 | P2 | Confirmed contention / operational availability | [seed/persist.ts:13](../src/modules/quests/seed/persist.ts#L13), [standard/context.ts:13](../src/modules/quests/standard/context.ts#L13), [challenges/service.ts:17](../src/modules/challenges/service.ts#L17); importer/gameplay lock acquisition | Operational runbook before live use | 0.5 day runbook; 2–4 days redesign if needed |
| A10 | P2 | Confirmed non-idempotent request semantics / retry risk | [challenges/service.ts:68](../src/modules/challenges/service.ts#L68), [challenges/api.ts:5](../src/modules/challenges/api.ts#L5); increment/decrement | Before automatic retries/offline clients | 1–2 days |
| A11 | P2 | Confirmed version-dispatch omission / future integrity risk | [standard/content.ts:21](../src/modules/quests/standard/content.ts#L21), [standard/resolution.ts:22](../src/modules/quests/standard/resolution.ts#L22), [challenges/service.ts:60](../src/modules/challenges/service.ts#L60); snapshot and settlement | Before balance changes with in-flight quests | 1–2 days |
| A12 | P2 | Confirmed destructive test primitive / operator risk | [database-constraints.test.ts:6](../tests/integration/database-constraints.test.ts#L6), [test.ts:61](../tests/integration/database-constraints.test.ts#L61); environment selection and hooks | Recommended before public contributor workflow | 0.5 day |
| A13 | P2 | Confirmed buffering gap; potential exhaustion / resources | [lib/api.ts:19](../src/lib/api.ts#L19), [lib/db.ts:9](../src/lib/db.ts#L9), [standard/api.ts:11](../src/modules/quests/standard/api.ts#L11); `payload`, pool construction, authenticated GET | Before untrusted internet deployment | 1–2 days |
| A14 | P3 | Measured bundle opportunity / frontend | [config/game.ts:1](../src/config/game.ts#L1), [game.ts:126](../src/config/game.ts#L126), [standard-quests.tsx:8](../src/components/standard-quests.tsx#L8); module initialization/client import | No | 0.5–1 day |
| A15 | P3 | Confirmed request pattern, unmeasured cost / admin UI | [admin-library.tsx:9](../src/components/admin-library.tsx#L9), [admin/service.ts:18](../src/modules/admin/service.ts#L18); filter effect, `listQuests` | No | 1–2 hours |

## 8. Recommended fixes

Each item below provides the impact/consequence and recommended correction for the table's evidence, location, priority, effort and release decision. None was implemented.

### A01 — Vulnerable locked dependencies

**Evidence:** Successful registry audit and installed/locked versions; applicability triage in section 6. **Impact:** 25 advisory records, including three upstream critical records; no successful exploit or affected data demonstrated. **Consequence:** Deploying this lockfile without resolving applicable conditions can expose users; public consumers also inherit the vulnerable graph. **Fix:** Upgrade deliberately to patched supported versions, verify Sharp resolution, update the matching Next lint tooling, rerun unit/integration/build and dependency scans, and document any unreachable optional-tooling advisories. Do not make a “no vulnerabilities” claim based solely on lack of application imports.

### A02 — Home fails when every Standard slot is occupied

**Evidence:** 24 ordinary accepts followed by recommendation lookup gives `NO_RECOMMENDATION_CANDIDATE`; Home's render condition requires a recommendation. **Impact:** Entire normal Home gameplay surface unavailable on reload, not just an empty recommendation card. **Consequence:** Users cannot use normal UI to complete/clear quests to recover, although REST mutations remain available. **Fix:** Represent absence of an eligible recommendation explicitly in the service/API/client types; render progression, active quests, slots and Challenges, with a valid empty recommendation message. Preserve F2's handling for actual loading failures. Add all-accepted and all-expired/blocked Home tests.

### A03 — Challenge acceptance bypasses current content eligibility

**Evidence:** A pending/inactive assigned definition was accepted. Initial `ensureSet` selection filters approval/activity, but the later acceptance branch does not. **Impact:** One reproduced acceptance of disallowed content; snapshots capture the newly edited values. **Consequence:** Curation deactivation/re-review cannot reliably withdraw unaccepted Challenges, including safety-related changes. **Fix:** Recheck approval/activity, pool eligibility, excluded difficulty and structural validity inside the existing locked acceptance transaction. Preserve already accepted snapshots. Decide replacement/unavailable presentation under the existing no-reroll product contract rather than inventing a new reroll rule. Test deactivation and gameplay edits between assignment and acceptance.

### A04 — Weekly mutation depends on a prior Daily refresh

**Evidence:** P2025 after Tuesday mutation of Monday's still-valid Weekly quest; current Daily set missing; zero reward and ACCEPTED status after rollback. A GET then makes the same operation succeed. **Impact:** Valid mutation returns an unexpected error at rollover; no partial XP observed. **Consequence:** Request-time correctness depends on cron/GET ordering, contrary to the lazy-reconciliation contract. **Fix:** Ensure response prerequisites within the transaction or return a mutation response that does not require unrelated current sets. Keep expiration's commit-before-domain-error behavior. Add stale-page Daily rollover, timezone-change, and direct-REST tests without pre-reading the current pools.

### A05 — Timezone changes hide still-active accepted Challenges

**Evidence:** UTC→Denver creates two new current sets while an old accepted Weekly quest remains stored and is omitted from both response pools. **Impact:** Four simultaneous stored sets in one observation; accepted quest inaccessible through current UI. **Consequence:** Users lose visibility of commitments and may obtain overlapping extra sets. Repeated timezone reward farming was not tested and is not claimed as a confirmed exploit. **Fix:** Resolve currently active fixed windows independently from a newly computed timezone window, and preserve access to all relevant accepted quests. The owner must specify exactly when each pool adopts a new timezone if old/new windows overlap; the existing contract clearly forbids altering existing windows, but does not fully specify transition presentation or extra-set eligibility. Do not add an unapproved timezone cooldown. Add both timezone directions and DST-boundary integration tests.

### A06 — Standard COUNT can settle without progress

**Evidence:** Valid COUNT target 3 offer completed with progress 0 and one reward; admin validation permits this combination, current seed happens not to use it. **Impact:** Conditional on future/admin-created Standard COUNT content. **Consequence:** Promised repetition target and stored terminal progress disagree. **Fix:** Implement the specified COUNT progress semantics through reusable service/REST boundaries and matching UI, or obtain an explicit product decision narrowing COUNT eligibility and enforce it at every content boundary. Do not silently redefine existing game rules. Test zero progress, corrections, target completion and concurrent target calls.

### A07 — Full completion history fetched repeatedly under Player lock

**Evidence:** Unbounded `findMany`, post-fetch per-Skill filtering, measured 6.4× Standard-read median and 9.6× recommendation-recompute median at 10,000 completions. A cache hit is still 281 ms. **Consequence:** Long-lived users hold locks and connections longer; their concurrent interactions queue; reconciliation processes increasing history unnecessarily. **Fix:** Query only required recent completions per relevant Skill, maintaining multi-Skill snapshot membership and deterministic ordering. Separate cheap persisted recommendation validation and expiration-only contexts from selection context construction. Reuse bounded history within one operation. Evaluate a suitable composite/indexed query after the bounded design; a global `take: 40` is not an equivalent last-five-per-Skill contract.

### A08 — Redundant reconciliation/state reads and post-action requests

**Evidence:** Warm Home 136 SQL statements. `reconcileInTransaction` returns `standardState`; Standard read discards it and calls `standardState` again; recommendation calls also discard that view then load slots. `acceptRecommendation` calls `act` (POST + recommendation GET) and then `reconcileHome` (Standard GET + second recommendation GET): **four HTTP requests for one successful recommendation accept**, counted from source. Other successful Standard actions use two; Challenge complete/increment uses three. **Consequence:** Additional authentication, locks, relation reads and repeated whole-state renders; slower networks magnify round trips. **Fix:** Return/reuse one authoritative state representation per operation, avoid discarded view queries, and consolidate only demonstrably redundant refreshes. Preserve F1 progression/streak refresh after actual rewards and F3 state recovery. Do not parallelize Player-locked services merely to make the code look concurrent. Browser request counts/timings for these clicks were not measured because E2E setup was blocked.

### A09 — Seed/admin library locks are a global gameplay barrier

**Evidence:** Import table locks conflict with every Standard/Challenge context's SHARE locks; an isolated read was observed waiting on a relation lock. Repeat import: 478 statements, median 519 ms. Admin writes also need conflicting relation lock modes. **Consequence:** Content operations can queue gameplay across different Players; long imports can exceed gameplay's 20 s transaction budget. No production outage was simulated. **Fix:** Immediately document an import maintenance window and expected blocking, bound/monitor operational execution, and avoid overlapping jobs/imports. If measured deployment load requires it, redesign around narrower/versioned content locking with acceptance snapshot consistency tests. Never remove locks without replacing their integrity protection. Seed ownership and no-hard-delete behavior are strengths to retain.

### A10 — COUNT progress has no retry identity

**Evidence:** Same increment delivered twice advances 0→1→2; server-generated reward operation IDs do not identify an increment request. **Consequence:** Lost-response retries can count one real-world event twice or repeat a decrement. Terminal reward uniqueness prevents a second reward but does not make intermediate progress idempotent. **Fix:** Add a client-generated operation UUID or expected-progress/version contract with transactional deduplication/conflict handling. Distinct intended increments must still be allowed; do not deduplicate merely by identical JSON. Test same-key retries, different-key concurrency, and an ambiguous timeout followed by state refresh.

### A11 — Recorded reward config version is not used by settlement

**Evidence:** `previewSnapshots` stores `rewardConfigVersionSnapshot`; resolution reads current failure/Catch-Up/streak configuration, and Challenge settlement/current set views read current Challenge/set bonus values. No version-dispatch resolver uses that snapshot in the reviewed settlement path. **Impact:** No past balance deployment mismatch was demonstrated; current values are centralized and stable. **Consequence:** A future configuration update can change an already accepted quest's promised reward/penalty, despite the stored version string. **Fix:** Resolve immutable reward inputs by stored version or snapshot the required parameters, with an explicit compatibility strategy for historical rows. Add acceptance-under-version-A/completion-under-version-B tests before changing balance. Continue calculating legitimately dynamic state (e.g. current lowest Skill/streak) according to the authoritative rule.

### A12 — Constraint tests can truncate an unintended database

**Evidence:** Only a nonempty `DATABASE_URL` is required before unqualified `TRUNCATE users, skills, quest_families CASCADE` in both setup and teardown. Other suites already demonstrate random-schema isolation. **Impact:** Confirmed destructive primitive; no existing data was destroyed by this audit. **Consequence:** A contributor running the integration command from a shell with an application URL can lose game/content data; documentation alone is not an executable guard. **Fix:** Move this suite into its own schema, use a deliberately separate test URL/explicit disposable-target check, and use a DB principal unable to truncate application schemas. Retain disposable CI PostgreSQL. Reproduce validation only against a deliberately expendable DB, never by testing the guard on real data.

### A13 — Resource admission is incomplete

**Evidence:** Synthetic 1 MiB body fully consumed before 413; no repository rate limiter/queue bound around expensive authenticated gameplay reads/mutations; DB constructor leaves pool/deadline settings implicit. **Impact:** Buffering demonstrated; server exhaustion and cross-user denial of service not attempted. Authentication before parsing limits anonymous application-route abuse. **Consequence:** An authenticated client can submit large bodies or queue repeated expensive reads, especially with long history; deploy-time reverse-proxy limits are unknown. **Fix:** Enforce a streaming byte cap (Content-Length check only as an early rejection, not sole protection), set request deadlines, and define deployment-level request/concurrency limits and database connection budget. Rate limits should protect resources without inventing game quotas or changing the free/unlimited reroll rule. Validate controlled overload on disposable infrastructure before internet operation.

### A14 — Client config import carries server-oriented validation code

**Evidence:** Home/Settings manifest inventories and 86,979-gzip-byte shared chunk containing Zod; client imports the full schema-parsed `gameConfig` module. **Impact:** Measured bytes, not measured rendering slowdown or isolated library attribution. **Consequence:** Extra download/parse cost on slower devices for a mostly fixed configuration. **Fix:** Expose a small typed client-safe configuration subset while keeping full schema validation in build/server paths and tests. Rebuild and compare actual route transfer before pursuing further splitting; preserve a single source of balance truth.

### A15 — Admin search fires for every keystroke

**Evidence:** Each `filters` change starts a fetch; cleanup aborts the browser request, but cannot establish that server/database work stops. `listQuests` runs count plus a case-insensitive contains query. **Impact:** Source-confirmed request pattern; no significant latency measured on 275 definitions. **Consequence:** Avoidable curator traffic as content grows. **Fix:** Debounce only free-text search or use explicit submission, preserving immediate categorical filters and abort cleanup. Do not add trigram/search infrastructure without an observed larger-library query problem.

## 9. Safe optimization opportunities

Prioritize A07/A08 before UI memoization. Other low-risk directions to evaluate after correctness fixes:

- Reuse already-loaded Skill progress/streak rows instead of fetching them repeatedly within a transaction.
- Avoid sending/loading a full Standard view just to check an expiration-only condition; preserve authoritative lazy transitions.
- Keep Profile's selective projection and admin pagination. Narrow family/reference fields to those actually rendered if their payload becomes large.
- For Challenge increments below target, avoid a full progression refresh only if the response explicitly establishes that no reward or relevant reconciliation occurred. Do not regress F1.
- Bound/cache immutable library data only with reliable curation/seed invalidation and acceptance-time validation. Never publicly cache personalized gameplay or replace transactional checks with a stale process cache.
- Collapsed Skill/Challenge panels remain mounted via `hidden`; they still render. At the fixed 24+8 card scale no expensive render was demonstrated. If profiling shows meaningful cost, split stable card subtrees and reuse date formatters before introducing broad memoization.
- Retain small synchronous progression math, existing lazy Prisma singleton, strict DTOs, no-store identity responses and deterministic test injection.

## 10. Deferred optimizations and rationale

- **Microservices, Redis, queues for ordinary gameplay, read replicas:** no evidence these solve the measured repeated work; they add consistency/operational complexity to a small modular monolith.
- **Blanket `Promise.all` for Home:** same-Player locking serializes work; measurements show queueing. Consolidate shared work first.
- **Blind indexes on every filter:** 275-definition scans are small; the representative history root query itself took 3 ms. Fix cardinality and test realistic plans before migration design.
- **Virtualized 24-slot UI, pervasive `memo`/`useMemo`, alternate state library:** no browser CPU profile supports this; repeated server work is established.
- **Caching rewards, stale personalized pages, asynchronous partial settlement:** incompatible with transaction/idempotency requirements unless carefully redesigned; not proposed.
- **History partitioning/archival and worker sharding:** potentially useful much later, but bounded recent-history access and efficient no-op reconciliation come first. Ledger retention remains a product/operations decision.
- **New monitoring services or benchmark dependencies:** none installed. A deployment should record route latency, pool wait, transaction duration and job failures, but no infrastructure expansion was needed to establish these findings.
- **New game rules (timezone cooldowns, paid/limited rerolls, progress verification):** not authorized and not remedies to introduce during this audit.

## 11. Testing limitations

1. This is one developer workstation and loopback PostgreSQL. No WAN latency, TLS, production proxy, multi-replica pool pressure, real user mixture, or sustained public load was modeled. Host memory is not a measured Node/PostgreSQL peak; Docker resource limits were not profiled.
2. Browser E2E could not start because the existing dev server owns the checkout. There are no new Lighthouse, LCP/INP, React Profiler, real-browser action-network, or mobile paint results. Manifest sizes do not substitute for those measurements.
3. Thirty-sample p95 values are exploratory. Single cold loads, three repeated imports, ten mutations and one five-request burst do not support robust tail/capacity estimates. Cold filesystem/database cache effects were not controlled.
4. Synthetic history repeats one eligible definition with normalized Skill snapshots; it lacks a full reward ledger and realistic per-Skill distribution. It establishes growth cost, not production scale or reward correctness. No 100,000+ row or destructive stress test was attempted.
5. The EXPLAIN covers the root completed-history query only. No claimed plan for all Prisma relation fetches, admin text search at large scale, or multi-player history exists.
6. Google OAuth was not exercised live. Existing auth/domain/integration tests and temporary normally encrypted session cookies were used. HTTP timings include session resolution but not provider redirect/token exchange.
7. Full dependency audit of development-only dependencies and exhaustive Git-history secret scanning were not completed. Production-graph advisories were fetched and key direct-dependency applicability checked; no exploit payloads were executed.
8. Existing integration tests emit a pg warning about simultaneous calls on an already executing client, relevant to a future pg 9 migration. Current pg 8 tests passed; this was not misclassified as a present runtime failure.
9. The production build was cached, and its own TypeScript phase passed; the separate `pnpm typecheck` script was not independently run. No clean dependency install was attempted.
10. Accepted config-version behavior was inspected statically, not tested through a production deployment upgrade. Timezone overlap policy needs owner resolution before a behavior-changing fix. Audit work did not invent that policy.
11. CI workflow source was reviewed, not a new remote CI execution. It uses frozen dependencies and disposable PostgreSQL for integration tests but does not run Playwright or dependency audit. Local pass results are not a claim about a remote pipeline run.

## 12. Public-release readiness assessment

**Ready for further review, not yet ready for an unqualified release-ready claim.** The application demonstrates strong foundational transaction safety and useful test coverage, and small-data local response times are reasonable. The new reproduced defects show that passing current tests does not cover every valid lifecycle/UI state.

Before a release-ready public GitHub release, resolve A01–A05 and rerun focused regression tests plus the existing suite. A05 needs a product decision about timezone overlap transition behavior. For actual internet deployment, also resolve A13's request/resource boundaries and adopt A09's operational import procedure. A12 is strongly recommended before inviting contributors to run destructive integration commands. A06 and A11 must be addressed before enabling their triggering content/balance changes.

Release validation should explicitly include: all slots accepted/expired; retired/unapproved Challenge acceptance; stale Weekly action after Daily rollover without a prior GET; accepted Challenge visibility through timezone changes; duplicate COUNT deliveries; and dependency re-audit. Run the existing desktop/mobile E2E suite once the checkout can host its isolated test server, without reusing a real application database.

Publishing source with a clear known-issues section is a separate owner decision and is not itself evidence of production exposure. No confirmed P0 exploit was demonstrated. The dependency version risks and reproduced data-integrity defects are real and should not be obscured by the passing baseline suite.

**Audit-only boundary:** no application fixes, dependency installs/updates, repository schema/configuration changes, commits, or pushes were made. Only this report was added; disposable test infrastructure was cleaned up after measurements. Implementation awaits owner approval.
