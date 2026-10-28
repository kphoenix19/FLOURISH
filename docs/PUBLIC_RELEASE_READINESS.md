# Public GitHub Release Readiness Audit

**Assessment date:** 2026-10-27

**Audited revision:** `bd0e3e0c5e132a6dc45a4f2a89a993d675a45b40` (`main`)

**Scope:** public portfolio source publication, separately from live application deployment. The working tree was clean at the start. This report is the only repository change made by this audit. No fixes, dependency upgrades, database commands, commits, pushes, or visibility changes were performed.

> **Follow-up:** See [the dated pre-publication cleanup](#pre-publication-follow-up--2026-10-27) for completed corrections and newer verification. The original assessment below is preserved as historical evidence.

## Executive summary

**GO for public portfolio source publication. Blockers: 0 demonstrated.** The repository presents a substantial, tested modular application with clear product contracts, transactional gameplay, reproducible PostgreSQL tests, and qualified performance evidence. No live credential or sensitive personal-data exposure was identified in the inspected local Git objects or screenshots. The exact audited commit has a successful Linux CI run, including 222 unit/component tests and 181 PostgreSQL integration tests.

This is not a claim that the application is vulnerability-free or production-certified. Three production-audit advisories remain on optional Prisma tooling dependency paths. They have no demonstrated reachability through the application's PostgreSQL HTTP request paths. Documentation needs a small accuracy pass, and the owner should decide explicit source reuse terms before describing the project as open source.

**Live deployment: not approved by this audit.** Public resource admission remains incomplete (A13). Standard COUNT behavior (A06), COUNT retry identity (A10), reward configuration versioning (A11), operational library locking (A09), browser journeys, and live OAuth require the treatment described below before their corresponding deployment scenarios are enabled.

## Findings and release decisions

### Blocker — must fix before public source release

None demonstrated within the inspected scope. This conclusion is bounded by the scanning and verification limitations below. A newly discovered real credential would change the decision and require revocation/rotation and history remediation before publication.

### Recommended — valuable but nonblocking

| ID | Finding and evidence | Minimal correction |
|---|---|---|
| R1 | README stack is stale: [README.md:58–65](../README.md#L58) names Next 16.3.4 and Zod 4.5.4 while claiming current manifest/lock versions. [package.json:33](../package.json#L33) and the lockfile resolve Next 16.4.1 and Zod 4.6.6. | Update those two version labels. Preserve historical versions in the original audit baseline. |
| R2 | Literal `85?86%` appears in [README.md:7](../README.md#L7) and [PORTFOLIO_SKILLS.md:87](PORTFOLIO_SKILLS.md#L87). Similar question-mark substitutions appear in A08's arrows/ranges. | Replace malformed punctuation with clear ranges/arrows; do not change measured values or invent impact metrics. |
| R3 | [PERFORMANCE_AND_RISK_AUDIT.md:282](PERFORMANCE_AND_RISK_AUDIT.md#L282) says “None was implemented,” although subsequent work fixed several findings. A01–A04 lack explicit current remediation annotations; the conclusion at line 460 still gives the original release prerequisites. | Add a dated current-status summary and A01–A04 remediation notes, keeping original findings and measurements explicitly historical. Use the status matrix below. |
| R4 | No root LICENSE, package `license` declaration, or tracked third-party NOTICE file was found. `private: true` controls npm publication, not GitHub source reuse. | Owner chooses intended reuse terms. Add the appropriate license if permissive or other open-source reuse is intended; review required notices for any distributed dependencies. Do not automatically choose a license. |
| R5 | No dedicated secret-scanning executable was available; the custom scan described below provides useful but incomplete assurance. CI does not run a production advisory check or dedicated secret scan. | Run an independent full-history scanner before publication where practical; enable available GitHub secret scanning/push protection and add an advisory-review policy that accounts for applicability. |
| R6 | [.github/workflows/ci.yml:29–35](../.github/workflows/ci.yml#L29) uses mutable major action tags, with no explicit workflow/job token permissions declaration. | Pin third-party action revisions and declare minimum required token permissions, normally `contents: read` for this workflow. |
| R7 | Playwright is absent from CI and current full browser execution was not verified. [README.md:200–202](../README.md#L200) correctly distinguishes test sessions from live Google consent and states that Playwright is outside CI. | Execute the complete browser suite on guarded disposable E2E infrastructure, then record actual results. Perform a separate manual OAuth callback check before offering a live demo. |

### Deferred — appropriate for future work

These findings do not prevent publishing source. Their activation conditions matter for deployment and feature claims.

| Finding | Remaining issue | Required treatment before the affected use |
|---|---|---|
| A06 | Standard COUNT can settle without tracked progress; current canonical Standard content uses SINGLE. | Resolve before publishing/enabling Standard COUNT content. Do not claim full Standard COUNT support. |
| A09 | Import/admin library locks can block gameplay across players. | Establish a maintenance procedure or improve locking before concurrent live content updates at meaningful traffic. |
| A10 | Challenge COUNT increments lack a request identity; retry after a lost response can increment twice. Terminal reward settlement is separately protected. | Add retry-safe progress semantics before automatic retries/offline delivery; distinguish progress idempotency from reward idempotency. |
| A11 | Settlement records a configuration version but uses current balance configuration. | Resolve before changing balance rules while accepted content remains in flight. |
| A13 | Body limit follows buffering, and explicit rate/concurrency/database-pool admission limits are incomplete. | Establish and verify resource boundaries before exposing the application to untrusted internet traffic. |
| A14 | Client configuration imports carry validation code into the client bundle. | Measure and reduce when prioritizing browser payload work. No measured rendering claim follows from bundle inspection alone. |
| A15 | Admin search issues requests per keystroke. | Debounce/cancel appropriately when polishing the administrator workflow. |

## Git history, secrets, personal information, and artifacts

### Coverage and method

The read-only scanner enumerated Git refs and reachable objects, then read every locally available object using `git cat-file --batch-all-objects --batch`. It inspected text blobs and commit metadata/messages; binary screenshots received separate visual and PNG metadata review.

| Coverage | Result |
|---|---|
| Commit objects | 34 |
| Objects reachable from all local refs | 905 |
| All locally available objects inspected | 922: 404 trees, 484 blobs, 34 commits |
| Text/binary blobs | 479 text blobs and 5 PNG blobs |
| Refs included | Local `main`; `origin/main`, `origin/HEAD`, `origin/fix/ci-route-type-generation`; three local Codex checkpoint refs |
| Tags | No local tags. Remote tag inventory was not conclusively verified. |
| Remote branch comparison | GitHub reported `main` at the audited SHA and `fix/ci-route-type-generation` at `ca29d784c698b6eb3920362e18cd4da785cdf607`, both represented locally. |

Patterns covered private-key headers; recognizable GitHub, Google, OpenAI, AWS and Slack credential formats; JWTs; credential-bearing database URLs; and literal assignments to common secret/password/token names. Email-like strings, sensitive paths, large blobs and commit messages were reviewed separately. Three configured local authentication/OAuth values were compared in memory against historical text objects, without emitting their contents: **zero matches**.

The scan produced 74 pattern candidates, triaged as placeholders, local development/disposable-test credentials, or code/validation examples. No high-confidence provider-token, private-key or JWT match was found. Examples of redacted triage evidence:

| Location/reference | Disposition |
|---|---|
| Historical `.env.example:7`, blob `5b463d4d32f75b894748ce8ad09eda36bfb47f50`, commits `74de6a8` / `d6a78d5` | AUTH_SECRET assignment is explicitly a replacement placeholder, not a discovered live credential. |
| Historical CI, blob `8d47c99b6b71f33257f0bb378fe0a388a65710cf`, commits `4755db0` / `d4da649` | Local ephemeral PostgreSQL service credentials. Current CI likewise uses disposable-only service values. |
| Historical Playwright config, blob `65c319a917d7a56578ecd6790653e50eef35dfb9` | Synthetic E2E OAuth configuration; not live provider credentials. |
| `tests/unit/database-safety.test.ts`, blob `7fd1f02503072076ebb45091a4c5a0c4411f3a73` | Deliberately invalid/fake database URL fixtures. |
| `src/config/env.ts` schema declarations | Pattern false positives on validation expressions. |
| Generated Prisma examples and `tests/unit/player-domain.test.ts:29` | Generic example email literals, including normalization fixtures; no identified account data. |

Commit identity review found GitHub privacy/noreply identities and a GitHub automation identity, not a personal mailbox needing redaction. No sensitive commit-message content was identified. Public authorship/repository ownership identifiers will naturally remain visible.

No committed real `.env`, private-key file, database dump/file, application log, `node_modules`, or Next build directory was identified in the inspected history. Generated Prisma TypeScript under `src/generated/prisma` is intentional generated source, not a database export; its inline schema describes models, not records. No blob exceeded 1 MB.

[.gitignore](../.gitignore) covers environment files except the documented template, dependencies, Next output, test/Playwright reports, logs, package-manager cache and TypeScript build metadata. It is not a substitute for scanning future arbitrary filenames, backups, keys or dumps.

**Limits:** neither Gitleaks nor TruffleHog was installed. This was a custom pattern scan, not an entropy/encoded-secret detector or proof that credentials never existed. Credential validity was not tested against providers. Remote-only/unfetched objects, hidden PR refs, deleted remote history, external artifacts, account settings and credential stores are outside the verified coverage. All local objects, including objects outside the reachable inventory, were included. No secret values are reproduced here.

## Dependency and licensing assessment

### Locked versions and installation

A01 application updates are present: **Next 16.4.1**, **eslint-config-next 16.4.1**, **Sharp 0.35.5**, **Zod 4.6.6**, and **source-map-js 1.2.2**. Manifest ranges and lockfile are consistent. Evidence: [package.json](../package.json), [pnpm-lock.yaml:21](../pnpm-lock.yaml#L21), Sharp package entry at line 3108, source-map-js at line 3151.

Both `pnpm install --frozen-lockfile --offline` and `pnpm install --frozen-lockfile` succeeded locally, reporting already up to date. These validate the existing installation rather than a clean local reinstall. The exact-commit Linux CI run independently completed frozen installation on its runner. No manifest or lockfile changes were made.

### Current production audit

`pnpm audit --prod --json` successfully obtained the registry response and exited **1** because of **two high and one moderate advisory; zero critical**. These are three advisories affecting two package versions, not three distinct application exploits.

| Advisory | Locked version / severity | Dependency path | Applicability and remediation status |
|---|---|---|---|
| [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), recursive graph stack exhaustion | `deepmerge-ts 7.1.5` / High | `@prisma/client → prisma → @prisma/config → deepmerge-ts` | Optional Prisma tooling path. No application request import identified. Patched upstream at `>=8.0.0`; do not force a major override without Prisma compatibility review. Remains open. |
| [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), authentication-plugin downgrade | `mysql2 3.15.3` / High | `@prisma/client → prisma → mysql2` | Optional Prisma tooling path. FLOURISH uses PostgreSQL through `@prisma/adapter-pg`/`pg`, not MySQL authentication. Patched at `>=3.22.0`; review a compatible upstream tooling update. Remains open. |
| [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), unbounded compressed-protocol inflation | `mysql2 3.15.3` / Moderate | `@prisma/client → prisma → mysql2` | Same unused MySQL tooling path. Patched at `>=3.23.1`, which also clears the preceding mysql2 advisory. Remains open. |

Upstream GitHub advisories were consulted for patched ranges. The application imports its generated PostgreSQL client; `prisma/config` is used by CLI configuration. No application mysql2/deepmerge import was found. Optional packages can still be installed or shipped: lack of demonstrated request reachability is not package removal or a clean audit. Reassess if tooling is exposed, database providers change, or deployment packaging changes.

### License inventory and source reuse

`pnpm licenses list --prod --json` succeeded. The local production inventory contained **227 package names / 236 package-version entries**:

| Declared license | Package names / version entries |
|---|---:|
| MIT | 162 / 164 |
| Apache-2.0 | 27 / 29 |
| ISC | 27 / 32 |
| BSD-3-Clause | 3 / 3 |
| BSD-2-Clause | 1 / 1 |
| Unlicense | 2 / 2 |
| 0BSD | 1 / 1 |
| MIT AND ISC | 1 / 1 |
| Apache-2.0 AND LGPL-3.0-or-later | 1 / 1 |
| CC-BY-4.0 | 1 / 1 |
| EPL-2.0 | 1 / 1 |

Notable entries are the Windows Sharp binary package `@img/sharp-win32-x64` (Apache/LGPL conjunction), `caniuse-lite` (CC-BY attribution), and `elkjs` (EPL, in tooling). Do not describe every dependency as MIT/permissive. Redistribution may require attribution/license notices and package-specific source/relinking or copyleft compliance. The checked local inventory is platform-dependent; a deployed image or downloadable binary needs its own complete inventory. No definitive license incompatibility was established merely from references in the lockfile.

The repository has no project LICENSE. Public GitHub hosting does not itself grant general open-source reuse rights; default copyright and GitHub's platform terms still apply. An explicit license is recommended for portfolio clarity, but its absence is not by itself a requirement to keep source private. See [GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository). This audit does not certify legal compliance for future binary/container redistribution.

## Application security and gameplay boundaries

| Area | Reviewed evidence and conclusion |
|---|---|
| Authentication/session | [auth/options.ts:9–42](../src/modules/auth/options.ts#L9): Google-only verified-email admission, dangerous email linking disabled, JWT retains persisted identity, current role/Player loaded from the database for the session, local redirect restrictions, sanitized authentication logging. [auth/adapter.ts:9](../src/modules/auth/adapter.ts#L9) does not persist provider access/refresh tokens or reassign an existing provider account to another owner. Live Google consent/callback remains untested in this audit. |
| Authorization/account isolation | [auth/guards.ts:4–18](../src/modules/auth/guards.ts#L4) separates authenticated, Player, onboarding and administrator requirements. Reviewed gameplay routes derive Player identity from the server principal; administrator routes guard operations before service access. Challenge mutation lookup includes both quest and Player IDs. No client-supplied role/Player authorization bypass was identified. |
| Input, CSRF, errors | [lib/api.ts:4–21](../src/lib/api.ts#L4): schema and malformed JSON errors are controlled, conflict errors are stable, unknown exceptions become generic 500 responses, JSON responses are non-cacheable. Cookie-authenticated REST writes require same-origin JSON and reject cross-site fetch metadata. Auth endpoints use their authentication framework flow. |
| Resource limits | [lib/api.ts:19](../src/lib/api.ts#L19) reads the complete request body before the 16,384-character check; this is not an enforced streaming byte limit. Explicit rate limits, bounded admission and database-pool policy remain A13 deployment work. |
| Secrets/SQL | Server authentication modules are server-only; reviewed client responses do not expose configuration secrets. Runtime raw SQL uses parameterized template queries. Dynamic test schema identifiers are validated/quoted. Generated Prisma APIs containing unsafe method names are not evidence of application calls to those methods. No application SQL-injection path was identified. |
| Atomicity | Standard/Challenge operations retain Player locking, transactional rewards/progression/state transitions and unique reward records. Genuine failures roll back gameplay changes. This does not make COUNT progress requests retry-idempotent (A10). |
| Lifecycle | [challenges/service.ts:87–107](../src/modules/challenges/service.ts#L87) validates acceptance eligibility under library locking and creates required response pools within the mutation transaction. Accepted snapshots remain usable, expired quests cannot earn rewards, and expiration errors requiring reconciliation occur after commit. A05 retains old period boundaries and allows null pools until a full new local period begins. |
| Standard/recommendations | [standard/context.ts:10–30](../src/modules/quests/standard/context.ts#L10) and [standard/history.ts](../src/modules/quests/standard/history.ts) retain locked, bounded per-Skill history behavior. A02 permits an absent recommendation; A08 reuses authoritative state without removing progression refreshes after Challenge rewards. |

These are source-review conclusions supported by current regression suites, not a penetration test or proof of absence of all vulnerabilities.

## A12 database and test safety

The current safeguards are executable and shared, rather than documentation warnings:

- [database-safety.ts:4–16](../tests/support/database-safety.ts#L4) requires separate `TEST_DATABASE_URL` / `E2E_DATABASE_URL`, a loopback host, exact dedicated database/role names, a password, and no URL query/hash overrides. Missing or normal application targets fail before fixture operations.
- [database-safety.ts:20–43](../tests/support/database-safety.ts#L20) checks actual server database/role identity, elevated privileges, ownership and memberships, then the administrator-owned disposable marker and protected-schema privileges. The restricted role cannot alter the marker. Integration credentials cannot use/create objects in `public`.
- [integration-database.ts:7–72](../tests/support/integration-database.ts#L7) owns a random validated schema, applies migrations under its search path, checks identity/schema before reset, qualifies tables, enumerates foreign-key dependencies and uses `TRUNCATE ... RESTRICT`. Teardown verifies ownership/external dependencies before dropping only the harness-owned schema.
- [setup-test-database.ts:4–34](../scripts/setup-test-database.ts#L4) refuses a populated target and provisions restricted privileges/marker. E2E preparation and fixture connections validate the separate E2E target before migrations or writes. E2E's use of public tables is confined to that dedicated marked database.
- [.github/workflows/ci.yml:13–44](../.github/workflows/ci.yml#L13) provisions a fresh PostgreSQL 17 service. Admin configuration is supplied to provisioning; tests use the restricted role. Current Linux integration tests, including safety/constraint coverage, passed.

Destructive SQL found in current test infrastructure is behind these guards. No remaining unguarded test reset against application `DATABASE_URL` was identified. README application migration/seed commands are intentional local setup, separate from its guarded test workflow. Historical commits still contain the original unsafe A12 harness; contributors should use the current workflow rather than execute old integration code against an application database.

No local database provisioning, migration, reset, integration execution or E2E execution was performed during this audit. Reviewing the already-running CI results did not trigger a new workflow. The marker is an operational isolation mechanism, not protection against a malicious administrator deliberately misprovisioning a database; tests sharing a restricted role are also not mutually untrusted security tenants.

## CI, reproducibility, and checks actually verified

**Confirmed successful Linux run for the exact audited SHA:** [GitHub Actions run 40574920107](https://github.com/kphoenix19/FLOURISH/actions/runs/40574920107), `verify` job `122438647199`, push to `main`, 2026-10-27. The runner reported Ubuntu 24.04; the workflow uses Node 24 and pinned pnpm 11.25.0. The job and every required step reported success, not merely a queued status or an older commit's green badge.

| Check | Evidence/result |
|---|---|
| Frozen install | Local existing-store offline and ordinary frozen installs passed; current Linux CI frozen install passed. |
| Lint | Current Linux CI passed. |
| TypeScript / Next type generation | Current Linux CI passed. |
| Complete unit/component suite | Current Linux CI: **222 passed, 18 files**. |
| Guarded disposable PostgreSQL provisioning | Current Linux CI passed. |
| Complete integration suite | Current Linux CI: **181 passed, 7 files**, including database safety and constraints. |
| Production build | Current Linux CI passed. |
| Production advisory audit | Executed locally against registry: exit 1, 2 high / 1 moderate, triaged above. |
| Production license inventory | Executed locally; inventory summarized above. |
| Git history/secret/artifact review | Executed locally across all available Git objects; limits documented above. |
| Screenshots | All five files visually inspected, PNG metadata inspected, README references checked. |
| Report whitespace/diff | `git diff --check` run after report creation; repository status checked for unintended changes. |
| Browser E2E / live OAuth | **Not executed or verified for this revision.** No claim that discovery or mocked sessions prove real browser/provider flows. |

No additional Linux execution is outstanding for the listed CI gates at this SHA. Any subsequent code/dependency/workflow change needs its own current CI result. The existing pg concurrent-query deprecation warning remains a future compatibility concern; it did not fail the current suites. These checks do not establish production throughput, reliability under hostile load, or deployment-secret correctness.

## Portfolio presentation and screenshots

The README explains the product, links authoritative rules and architecture, describes transactional progression and test strategy, and provides local setup plus isolated test instructions. Implemented systems are distinguishable from backlog work. Runtime recommendations are curated/rule-based; no runtime LLM feature or user-adoption/business-impact claim was identified that needs substantiation.

The performance case study is a strong hiring-manager entry point. A07's approximately 89% recomputation improvement is consistent with 559.60 ms to 62.54 ms local medians. A08 records warm Home SQL reduction **126 to 90**, local service median **105.84 to 81.86 ms**, and recommendation acceptance fetches **4 to 2**. The documentation correctly separates PostgreSQL service timings from mocked component fetch counts and does not claim measured browser rendering, real HTTP latency, or production capacity. These numbers were reviewed against existing benchmark records, not remeasured during this audit. Historical baselines should remain intact when correcting status text.

All five README screenshot references resolve to the expected PNGs:

| Screenshot | Dimensions | Review |
|---|---:|---|
| [Home](screenshots/home-dashboard.png) | 1977 × 1727 | Dashboard/progression and recommendation presentation match the documented feature. |
| [Standard Quests](screenshots/standard-quests.png) | 1443 × 1823 | Skill-based quest slots and action states are visible. |
| [Daily/Weekly Challenges](screenshots/daily-weekly-challenges.png) | 731 × 1079 | Challenge pools, completion meters and COUNT progress are visible. |
| [Skill progression](screenshots/skill-progression.png) | 1622 × 1211 | Eight-Skill progression overview matches the README reference. |
| [Profile](screenshots/profile.png) | 1792 × 852 | Overall progression, timezone and Focus allocation match the reference. |

No visible email, personal name, private URL, browser credential, or identifying photo was found. Game progress and a timezone are visible. PNG auxiliary chunks were limited to color/gamma/physical-resolution information; no textual or EXIF metadata was found. These five images also account for all five binary image blobs in the inspected Git object inventory. Screenshots substantiate presentation, not a fresh browser acceptance test.

## Current A01–A15 status

This matrix distinguishes current source from the historical [performance and risk audit](PERFORMANCE_AND_RISK_AUDIT.md). It does not rewrite that audit's original evidence.

| Finding | Current assessment |
|---|---|
| A01 | Application dependency patches implemented; three optional tooling advisories remain, as explicitly triaged above. Do not label the whole production graph advisory-free. |
| A02 | Implemented: nullable recommendation preserves Home rendering and real-error handling. |
| A03 | Implemented: current active/approved status, appropriate Daily/Weekly eligibility, supported non-Legendary content and valid allocations checked at acceptance under locking; accepted snapshots preserved. |
| A04 | Implemented: required current response pools are established inside mutation transaction; valid Weekly actions survive Daily rollover, with persisted expiration reconciliation retained. |
| A05 | Implemented: accepted period boundaries preserved; transitions wait for a full local-calendar period with nullable gap pools, including the agreed Denver-midnight/next-local-Monday policy. |
| A06 | Open, conditional gameplay limitation; address before enabling Standard COUNT. |
| A07 | Implemented: bounded recent history per Skill, deterministic ordering and multi-Skill snapshots; persisted hits avoid full history. Database scan work is not constant-time. |
| A08 | Implemented: authoritative slot/state reuse, reduced acceptance refreshes and serialized Home actions. Home still spans three transactions and other tabs/devices can interleave. |
| A09 | Open, operational locking concern. |
| A10 | Open, COUNT progress retry identity. |
| A11 | Open, configuration-version settlement. |
| A12 | Implemented: explicit disposable target, role/marker validation, isolated integration schemas and guarded cleanup; current Linux CI confirms compatibility. |
| A13 | Open, internet-facing resource admission. |
| A14 | Open, client bundle optimization. |
| A15 | Open, admin search request optimization. |

The deferred findings are not incorrectly marked fixed. The main documentation discrepancy is the opposite: original unresolved wording remains alongside later implemented fixes. Current CI includes the regression suites for the implemented changes, but does not erase the stated deferred limitations.

## Minimal ordered release checklist

1. Review this report and approve any follow-up changes; no fixes are included in this audit.
2. Preferably correct the README version labels, malformed punctuation and historical/current audit status wording in one focused documentation pass.
3. Decide source reuse terms. Add an owner-approved LICENSE if open-source reuse is intended; retain/review applicable dependency notices for anything redistributed.
4. Preferably run an independent history secret scanner and enable available repository protections. Resolve any real match before publishing; never treat ignoring a file as history removal.
5. Retain the successful exact-commit CI evidence; require another passing run for any subsequent implementation/dependency/workflow changes. Keep E2E/live OAuth gaps explicit until actually verified.
6. After owner approval, make the repository public manually. This audit did not change visibility, commit, push or trigger deployment.
7. Evaluate a live demo separately: enforce resource boundaries, verify OAuth and browser flows, review remaining advisories in the actual deployment artifact, and address A06/A09/A10/A11 when their triggering content, retry or operational scenarios apply.

**Decision boundary:** publishing this source is reasonable with the disclosed limitations. Exposing an authenticated application and its database to public traffic is a separate release decision requiring additional verification and operational controls.

## Pre-publication follow-up — 2026-10-27

This follow-up records the owner-authorized cleanup after the original assessment above. Historical findings, line references and the original exact-commit CI result remain evidence of that earlier state; they are not claims that the edited working tree has already run on GitHub Actions.

### Documentation and rights

R1–R3 are addressed: README version labels now match both the installed packages and lockfile (Next 16.4.1, Zod 4.6.6); malformed percentage ranges, finding ranges and before/after arrows were corrected without changing measurements. The original performance audit now opens with a dated remediation matrix and explicitly labels its original executive summary as historical. A01–A05, A07–A08 and A12 are implemented with the stated remaining advisories/limitations; A06, A09–A11 and A13–A15 remain open.

The owner chose **All Rights Reserved** portfolio viewing/evaluation terms. The README notice is preserved verbatim. No MIT, Apache or other open-source LICENSE was added. R4's owner decision is therefore resolved; the original lack-of-license observation remains historical. Dependency redistribution obligations still need separate review if distributing a binary or container.

### GitHub Actions hardening

The workflow now declares `permissions: contents: read` and disables persisted checkout credentials. Existing push/pull-request triggers, Node 24, package-manager pin, PostgreSQL 17 service, provisioning and every verification step remain intact. It does not require application secrets or write permissions for fork pull requests.

The existing v4 tags were resolved through the upstream GitHub Git-reference API on 2026-10-27, peeled to commits where necessary, and their commit records and `action.yml` inputs/runtime reviewed. All three commit records reported verified signatures. The pins are immutable commits, not guessed hashes or a major-version upgrade:

| Action | Verified commit |
|---|---|
| actions/checkout | [`11d5960a326750d5838078e36cf38b85af677262`](https://github.com/actions/checkout/commit/11d5960a326750d5838078e36cf38b85af677262) |
| pnpm/action-setup | [`b906affcce14559ad1aafd4ab0e942779e9f58b1`](https://github.com/pnpm/action-setup/commit/b906affcce14559ad1aafd4ab0e942779e9f58b1); v4 annotated tag object `f40ffcd9367d9f12939873eb1018b921a783ffaa` peeled to this commit |
| actions/setup-node | [`49933ea5288caeca8642d1e84afbd3f7d6820020`](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020) |

[actionlint 1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) passed against the edited workflow. Its Windows archive SHA-256 was checked against upstream release metadata: `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`. This validates workflow syntax/action usage locally, not execution on GitHub. **A successful run on the final pushed commit remains required evidence for the changed workflow.** No commit or push was performed here.

### Independent secret scan

[Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) was downloaded from its official release. The Windows x64 archive matched upstream SHA-256 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`. No project dependency was added. Two completed scans used the default scanner rules, full redaction, and `--ignore-gitleaks-allow`; no project suppressions or baseline exclusions were added:

1. `gitleaks git . --log-opts="--all --full-history" --redact=100 --ignore-gitleaks-allow`: **exit 0, no leaks**, 33 commits reported by Gitleaks, approximately 5.22 MB scanned across all local refs.
2. `git cat-file --batch-all-objects --batch` supplied every local text blob and commit/tag body directly to `gitleaks stdin` in memory: **exit 0, no leaks**, approximately 10.74 MB scanned. Inventory: 407 trees, 486 blobs and 34 commit objects (927 total); 481 text blobs plus 34 commit bodies scanned, five binary PNG blobs excluded from text scanning. This covers local-only/unreachable objects as well as commits, independent of the Git diff scanner's reported commit count.

The larger object count than the original audit reflects additional locally available objects; it does not imply new published commits. The original visual/metadata review covers the five PNGs. The default Gitleaks rules produced no findings requiring credential triage; the earlier custom scan's disposable credentials, placeholders and synthetic fixtures remain described above. No real secret was discovered, printed or placed in a report. Only fully redacted scanner reports were written to ignored local tool output.

Limitations remain: default rules are not proof of absence, encoded/unrecognized formats may escape detection, binary text recognition was not performed, and remote-only/deleted/hidden history was not fetched or certified. The explicit object pass addresses locally available unreachable history, not unavailable remote objects. Enable available GitHub secret scanning/push protection when publishing; no repository settings were changed by this task.

### Dependency advisory review policy

Run `pnpm audit --prod --json` before publication/deployment and after dependency or lockfile changes. For each advisory, record its identifier, severity, locked version, complete dependency path, authoritative patched range, affected feature and whether attacker-controlled inputs can reach it in the actual application/deployment. Severity describes the upstream weakness; application reachability determines practical exposure and upgrade urgency. An unused feature is a documented risk disposition, not a suppressed advisory or proof that a package cannot become reachable later.

Prioritize request-reachable high/critical issues and credible credential exposure immediately; review lower-severity reachable issues and tooling exposure according to impact. Prefer the smallest supported compatible upstream update, verify framework/ORM compatibility, and rerun frozen installation plus relevant/full checks. Major updates or overrides require explicit compatibility review. Reassess dispositions before changing providers, exposing tooling, changing deployment packaging, or handling new untrusted input. Review official advisory updates even if the lockfile is unchanged.

The follow-up `pnpm audit --prod --json` returned **exit 1: two high, one moderate, zero critical**, unchanged:

- `GHSA-ggr8-5vv4-36mx`: high, deepmerge-ts 7.1.5, `@prisma/client → prisma → @prisma/config → deepmerge-ts`; patched at 8.0.0.
- `GHSA-3f6p-5ww8-9rcr`: high, mysql2 3.15.3, `@prisma/client → prisma → mysql2`; patched at 3.22.0.
- `GHSA-rgwj-5xj2-c3m3`: moderate, the same mysql2 path; patched at 3.23.1.

All remain optional Prisma tooling paths in the audit response. Source still uses `@prisma/adapter-pg`/`pg`; no runtime mysql2/deepmerge import was identified. They remain open pending a compatible tooling remediation, rather than forcing a deepmerge major override or unrelated Prisma upgrade. No dependencies were upgraded, advisory IDs ignored, or failing audit gate introduced. This policy requires visible review of the complete audit result; any future automated gate must explicitly account for reviewed exceptions and fail/review newly introduced exposure instead of silently suppressing it.

### Follow-up verification

| Check | Executed follow-up result |
|---|---|
| `pnpm lint` | Passed; rerun after the E2E assertion correction. |
| `pnpm typecheck` | Passed; rerun after the E2E assertion correction. |
| `pnpm test` | 222 passed in 18 files. |
| `pnpm test:integration` | 181 passed in 7 files, against fresh PostgreSQL 17 with A12 provisioning and restricted credentials. |
| `pnpm build` | Passed. |
| `actionlint .github/workflows/ci.yml` | Passed with actionlint 1.7.12. |
| README/document local links and screenshot paths | Resolved; all five documented PNGs present. |
| `git diff --check` | Passed, including a separate check of the previously untracked release report. |
| Dependency/schema changes | No changes to `package.json`, `pnpm-lock.yaml` or `prisma/schema.prisma`. |

The sandbox initially refused the existing pnpm store/dependency check for unit/build execution; rerunning with store access succeeded without upgrades. The pg concurrent-query deprecation warning remains nonfatal and unresolved. No complete unit/integration pass is inferred from a partial test selection.

The integration run used task-created container `flourish-release-integration-20261027`, loopback port 55441, dedicated `flourish_test` database, administrator-owned marker and restricted test role. Provisioning was performed once on the empty instance; the existing harness created/migrated/reset/disposed its own schemas. The container was stopped after the suite, with its task-created anonymous volume removed through Docker's `--rm` lifecycle. No existing application database was used or altered.

### Browser E2E execution and remaining failures

Playwright Chromium 151.0.7922.34 (build v1234), headless shell and required Windows helper were installed using `pnpm exec playwright install chromium`. The complete existing configuration ran both Desktop Chrome (`chromium`) and Pixel 7 viewport (`phone`) projects, one worker, no automatic retries. Authentication used locally generated test-only session secrets and synthetic Google configuration, never live OAuth credentials.

The database was task-created container `flourish-release-e2e-20261027`, loopback port 55442, dedicated `flourish_e2e` database. The existing A12 provisioner validated the empty target, established the restricted role/marker, and `prepare-e2e-database.ts` validated again before applying the six existing migrations and canonical seed. No migration files/schema design changed.

The initial root-workspace attempt stopped before executing tests because an existing development server held Next's workspace lock. That server was not stopped or reused. Execution moved to an ignored copy of tracked source under `.pnpm-store/release-e2e-workspace`, excluding `.env`, sharing installed dependencies through a junction and retaining the existing guarded Playwright server startup. It used its own Next output and the same source/configuration. The only test edit between the complete runs was the corrected assertion described below. This isolated Windows environment is a verification limitation, not a browser performance benchmark.

| Complete run | Passed | Failed | Skipped | Result |
|---|---:|---:|---:|---|
| First run, existing tests | 3 | 5 | 0 | Exit 1, 5.4 minutes |
| Second run, corrected Focus fixture assertion; compilation cache retained | 4 | 4 | 0 | Exit 1, 4.3 minutes |

The onboarding fixture explicitly allocates Fitness **6** at [onboarding.spec.ts:32](../tests/e2e/onboarding.spec.ts#L32), but its settings assertion previously expected **5**. The assertion now uses `String(target.Fitness)` at line 57. This corrects the test's own inconsistency without weakening the check, changing allocation rules, altering UI/gameplay, or increasing timeouts. Desktop onboarding passed on the second run; phone onboarding advanced past that assertion before failing later.

Exact final-run coverage:

| Scenario | Desktop Chrome | Pixel 7 viewport |
|---|---|---|
| Foundation smoke (`smoke.spec.ts`) | Passed | Passed |
| Admin search/create/review/activation (`admin-curation.spec.ts`) | Failed: 90-second timeout navigating to `/admin`, line 5 | Passed |
| Onboard/reload/respec/timezone/admin boundaries (`onboarding.spec.ts`) | Passed | Failed: `Focus saved.` not visible within 5 seconds, line 61 |
| Standard lifecycle and Challenge actions (`standard-quests.spec.ts`) | Failed: `Challenge accepted.` not visible within 5 seconds, line 67 | Failed: same assertion |

The server logged route compilation during the admin and Challenge failures; Challenge failure snapshots showed `Updating challenge...` with actions disabled. These observations are consistent with development-server latency, but do not establish that every failure is purely environmental. Retaining compilation cache did not produce a clean suite. Later assertions in failed journeys, including remaining completion/expiration actions, **were not verified by those browser runs**. No gameplay changes or timeout increases were made to manufacture a passing result.

Both disposable containers were stopped/removed after testing. The E2E database's anonymous volume was task-created and removed by `--rm`; no named/development volume was used. Failure artifacts remain ignored under the isolated copy's `test-results` and `test-results-retry` directories. The downloaded audit tools and redacted reports also remain ignored under `.pnpm-store/release-tools`. Neither directory belongs in a source publication.

**R7 remains open:** diagnose the four final browser failures and obtain a complete passing run before claiming full browser verification or offering a live demo. To reproduce, use the README's fresh disposable E2E provisioning/preparation steps, install Chromium with `pnpm exec playwright install chromium`, and run `pnpm exec playwright test --reporter=line` with only `E2E_DATABASE_URL` targeting the guarded E2E database. Do not concurrently run another Next development server in that same source directory. Test sessions do not verify real Google consent/callback behavior; live OAuth still requires a separate manual check.

### Remaining publication decisions

The public-source assessment remains **GO with disclosed limitations**, not a statement that every check passed. No credible secret or new source-publication blocker was demonstrated. R1–R3 and R6 are completed; the owner resolved R4 with the preserved rights notice; R5 now has an independent scan and explicit advisory policy. R7 is partially executed and remains unresolved, as detailed above.

Before presenting the project as fully browser-verified, investigate the E2E failures and obtain a clean complete run. After owner-approved commit/push, require successful GitHub Actions on that exact revision; the original passing run cannot validate these workflow edits. Enable available secret scanning/push protection when publishing and keep the three tooling advisories visible. Live deployment remains a separate decision under the original resource-admission/gameplay/operational limitations. No commits, pushes, visibility changes or deployment were performed.

Follow-up files changed: `.github/workflows/ci.yml`, `README.md`, `docs/PORTFOLIO_SKILLS.md`, `docs/PERFORMANCE_AND_RISK_AUDIT.md`, this report, and the single fixture assertion in `tests/e2e/onboarding.spec.ts`.

### Browser E2E resolution — 2026-10-27

**R7 browser verification is now complete for the checked local desktop/phone configuration: 12 passed, 0 failed, 0 skipped, with retries disabled.** The original 3/5 and 4/4 runs above remain historical evidence; this section supersedes their unresolved-browser status. Live Google OAuth and final-commit Linux CI remain separate checks.

#### Investigation and root causes

Reviewed the original error-context snapshots, saved screenshots, dev-server logs, frontend action sequencing, REST/session boundaries, A05 scheduling rules, and A12 guards. The original runs had no trace/video of the failing requests: tracing was configured only for retries, and local retries were disabled. A new instrumented run against the unchanged development-mode application in the isolated source copy retained a trace and followed each operation through its HTTP response and persisted browser state.

| Original failure | Expected / actual browser behavior | Root cause and reproducibility |
|---|---|---|
| `admin-curation.spec.ts:5`, desktop Chromium | An authorized administrator should reach the Quest library. Navigation exceeded the 90-second test budget while `/admin` compiled. | Development-mode route compilation inside the test budget. Reproduced without changing the admin code: the diagnostic trace recorded `/admin` returning **200 after 99,661.9 ms**; navigation completed in about 99.8 seconds and the expected interface appeared. No authorization defect was found. |
| `standard-quests.spec.ts`, Daily acceptance, desktop Chromium | Accept should return success, show the accepted Challenge and preserve Home functionality. The 5-second message assertion failed while the UI still showed `Updating challenge...` and disabled controls. | The assertion was waiting for completion text before the pending mutation response had arrived; dev logs also showed Challenge route compilation. The diagnostic browser request returned **200 in 630.4 ms**, showed the accepted active quest, and the database recorded `ACCEPTED`. This verifies actual behavior, not just service tests. The original timeout reproduced in both prior full runs; the instrumented run and production-mode targeted/full runs succeeded. |
| Same acceptance assertion, Pixel 7 viewport | Same expected transition and same pending UI at the deadline. | Same request-synchronization/test-server problem. The recorded diagnostic used the phone viewport. Both viewport journeys now explicitly await the matching POST response, assert status 200, and retain their message/active-quest assertions. |
| `onboarding.spec.ts`, Focus save, Pixel 7 viewport | Save the valid revised allocation and persist it across reload. Snapshot showed Fitness 7, Hobbies 4, total 46, disabled controls and `Saving…`, not an error or incorrect allocation. | A completion assertion ran while the save request was pending. The diagnostic trace recorded PUT `/api/me/focus` **200 in 207.1 ms**; the success message appeared and values persisted after reload. The earlier stale 5-versus-6 fixture expectation had already been corrected and is not the cause of this later failure. The phone save timeout was intermittent; it did not recur in the diagnostic or final suites. |

The trace timings above describe one diagnostic run, not performance benchmarks. The original pending mutation requests have no captured network trace, so their exact transport/server delay cannot be reconstructed. In particular, attributing every Focus delay specifically to compilation would exceed the evidence. What was established is a premature completion assertion while an operation was still pending, followed by successful real HTTP/database/browser transitions when synchronized correctly. No gameplay, authorization, A05 or A08 application defect was demonstrated or changed.

#### Focused corrections

- [tests/support/e2e-server.ts](../tests/support/e2e-server.ts) validates the A12 target first, then runs `next build` followed by `next start` on loopback port 3103. Browser readiness now follows compilation rather than triggering compilation during navigation/mutation assertions. Build failure prevents startup. Next 16.4.1's installed CLI documentation explicitly separates `.next/dev` development output from production output; no source copy, port-3000 server reuse, or termination of the existing development server is needed for the final workflow.
- [playwright.config.ts](../playwright.config.ts) shares one generated `E2E_AUTH_SECRET` across runner, workers and test server, instead of relying on a developer's application secret. The server overrides application database/OAuth configuration with the guarded target and synthetic provider values, also for smoke-only execution. No authentication bypass was added. Failures retain traces/screenshots on their first attempt, and retries are disabled in both local and CI configuration.
- [tests/e2e/standard-quests.spec.ts](../tests/e2e/standard-quests.spec.ts) registers exact URL/method response waits before Daily and Weekly acceptance clicks, checks HTTP 200, then checks the existing success message and active-quest state. A08's shared action lock and reward refreshes remain unchanged.
- [tests/e2e/onboarding.spec.ts](../tests/e2e/onboarding.spec.ts) waits for the matching Focus PUT and checks HTTP 200 before completion text. Added assertions verify invalid incomplete totals disable Save, valid totals restore usability, and Fitness/Hobbies values and the 46-point total persist after reload on both viewports.
- [tests/e2e/challenge-transitions.spec.ts](../tests/e2e/challenge-transitions.spec.ts) adds one Daily-gap and one Weekly-gap case per viewport. Fixtures use real local-calendar windows safely away from the current boundary and modify only that test Player's disposable records. The timezone change itself goes through the API. Each case verifies a nullable pool and next-start display, normal progression/24 Standard slots, acceptance/completion in the other pool, accepted Active Quest rendering, one acceptance interaction on repeated acceptance, no reward on acceptance, exactly one reward on completion, and unchanged reward/Overall-XP settlement after repeated completion is rejected with 409. Reload and API reads confirm the gap and completed state persist.

These are test infrastructure and test-only corrections. No application source, gameplay rules, transaction boundaries, schema, dependencies, licensing, or selection algorithms changed. No sleeps, higher assertion/test deadlines, or retry-based passing results were introduced. The one-off diagnostic allowed enough navigation time to observe the original slow response; that diagnostic is ignored local evidence, not the committed test policy.

#### Exact execution and final results

All authenticated tests used a newly provisioned `flourish_e2e` instance on loopback port 55442, restricted credentials, the administrator-owned A12 marker, existing migrations/seed, and synthetic encrypted sessions. Integration used a separate fresh `flourish_test` instance on port 55441.

| Execution | Result |
|---|---|
| Instrumented unchanged-dev diagnostic, phone, `diagnostic.spec.ts --trace=on` in the ignored source copy | 1 passed; successful admin navigation, Focus save/reload and Challenge acceptance; trace retained. |
| Intermediate harness checks | A TypeScript startup error was corrected before browser execution. A subsequent six-case run failed because a newly generated secret was being rotated when each worker reloaded config; sharing the test-only key through `E2E_AUTH_SECRET` corrected that test setup issue. Neither is classified as an original application defect. |
| `pnpm exec playwright test admin-curation.spec.ts onboarding.spec.ts standard-quests.spec.ts --reporter=line` after corrections | **6 passed, 0 failed, 0 skipped**, 41.8 seconds. All three original journeys executed on both viewports. |
| `pnpm exec playwright test --reporter=line` with the new gap cases | **12 passed, 0 failed, 0 skipped**, 46.9 seconds. |
| `pnpm test` | **222 passed, 18 files**. Sandbox initially denied esbuild process creation; rerun with process access passed. |
| `pnpm test:integration` | **181 passed, 7 files**, including existing A03/A04/A05/A07/A08, concurrency, rollback and database-safety coverage. |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | All passed. Production build also runs before each browser invocation. |
| `git diff --check` and new-file whitespace checks | Passed. |

Final complete suite by viewport (no skips or retries):

| Browser scenario | Desktop Chromium | Pixel 7 viewport |
|---|---|---|
| Admin search/create/review/activation/navigation | Passed | Passed |
| Onboarding, Focus save/reload, timezone, admin denial/promotion and sign-out | Passed | Passed |
| Foundation smoke | Passed | Passed |
| Standard lifecycle, Daily acceptance and Weekly COUNT progress | Passed | Passed |
| Daily gap with Weekly acceptance/completion and repeat settlement checks | Passed | Passed |
| Weekly gap with Daily acceptance/completion and repeat settlement checks | Passed | Passed |
| **Total** | **6 passed / 0 failed / 0 skipped** | **6 passed / 0 failed / 0 skipped** |

The existing development-server process was retained. Task-created containers `flourish-browser-fix-e2e-20261027` and `flourish-browser-fix-integration-20261027` were stopped and removed, including their disposable anonymous volumes; no task containers remained afterward. Original failed artifacts and the new diagnostic trace remain ignored local evidence. Current failures will automatically retain artifacts under `test-results/`.

**Remaining concerns:** live Google consent/callback was not verified; Pixel 7 coverage is Chromium device emulation rather than a physical device; development-server cold compilation is not optimized by this test correction. The existing pg warning, three optional Prisma tooling advisories and deferred application/deployment findings remain as previously documented. Final pushed-commit GitHub Actions still needs confirmation; this local success is not that confirmation. Production builds and E2E should run sequentially because the test server serves production output, while the development server may remain running separately. No commits, pushes, visibility changes or deployment occurred.

Files changed in this browser-resolution task: `playwright.config.ts`, `tests/support/e2e-server.ts`, `tests/e2e/onboarding.spec.ts`, `tests/e2e/standard-quests.spec.ts`, new `tests/e2e/challenge-transitions.spec.ts`, the README's E2E workflow paragraph, and this report. Earlier pre-publication edits remain intact.
