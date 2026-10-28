# Ecopanel current project handover

**Audited:** 2026-10-27 (local workspace)  
**Source revision:** `master` at `c18a24553072f54b99aedb65537eea39abd3ba3f` (`Fix Agora ConvoAI request authentication`)  
**Working tree:** materially dirty. The Phase 2A–2E code, tests, migrations, CI workflow, documents, and UI are predominantly uncommitted. There are also three unusually named untracked text artifacts at the repository root. Nothing was reset, cleaned, committed, or otherwise changed during this audit except this handover document.

## 1. Executive summary

Ecopanel is a Next.js 14 recruitment application with two intentionally distinct modes:

- **Demo mode** uses browser-memory data and simulated actions (`components/DemoDataProvider.tsx`, `lib/demo-data.ts`). It is useful for the visual product demonstration, not a production backend.
- **Database mode** has a substantial PostgreSQL/Prisma recruitment implementation: Better Auth sessions, organization-scoped HR APIs, public job/apply APIs, private local CV storage, durable queues, email and Google Calendar adapters, and a newly added transcript-to-assessment pipeline (`lib/server/**`, `prisma/schema.prisma`).

The database implementation is not currently releasable: local `ecopanel_test` is one migration behind the checked-out Prisma schema, seven fresh integration tests fail as a result, and `npm run typecheck` fails. The running app was not present on port 3200. The source contains real-provider integrations, but no live Resend, Google Calendar, Agora audio, or OpenAI assessment run was verified.

## 2. Architecture

| Layer | Actual implementation | Evidence |
|---|---|---|
| Web application | Next.js App Router, React 18, Tailwind; public careers, HR portal, setup/demo/live views. | `app/**`, `components/**`, `package.json` |
| Data modes | `APP_DATA_MODE=demo` defaults to browser demo data; `database` enables server persistence and auth. | `lib/server/config.ts`, `components/AppModeProvider.tsx`, `app/layout.tsx` |
| Database | PostgreSQL via Prisma. Schema contains organizations, memberships, jobs, candidates, applications, CVs/scan jobs, HR events, interviews/transcripts/assessments/jobs, email, calendar, and rate limits. | `prisma/schema.prisma`, `prisma/migrations/**` |
| Identity/RBAC | Better Auth credential login with disabled public sign-up; `Membership` connects user and organization. HR route helpers obtain one membership and scope queries by organization. | `lib/server/auth.ts`, `lib/server/session.ts`, `lib/server/api-handler.ts` |
| File storage/workers | Private local filesystem storage, content validation/checksums, ClamAV/HTTP adapters, durable scan queue and `cv-worker`. | `lib/server/cv/**`, `scripts/cv-worker.ts` |
| Messaging | Persistent templates/messages/outbox, Resend adapter, signed webhook processor and `email-worker`. | `lib/server/email/**`, `scripts/email-worker.ts` |
| Calendar | Google OAuth with PKCE, AES-GCM token encryption, event outbox and `calendar-worker`. | `lib/server/calendar/**`, `scripts/calendar-worker.ts` |
| Assessments | Stored transcript versions, evidence validation, OpenAI Responses provider adapter, durable assessment jobs and worker source. | `lib/server/assessment/**`, `scripts/assessment-worker.ts` |
| Observability/CI | Request IDs, redacted logger, health routes, PostgreSQL limiter; GitHub Actions quality/integration/E2E/ClamAV jobs. | `middleware.ts`, `lib/server/logger.ts`, `lib/server/health.ts`, `.github/workflows/ci.yml` |

## 3. Definitive feature matrix

Status words distinguish source implementation from verification. “Implemented, unverified” is not production proof.

| Feature | Implementation status | Evidence/files | Tests | External dependencies | Remaining work |
|---|---|---|---|---|---|
| Landing page/navigation | Implemented UI | `app/page.tsx`, `app/layout.tsx`, `components/ui/**` | Demo-domain tests only | None | Browser regression/accessibility coverage not demonstrated fresh |
| Careers list/detail/search/filter | Implemented in database mode; demo fallback also exists | `app/careers/**`, `app/api/careers/jobs/**`, `lib/server/recruitment/jobs.ts` | Covered indirectly by E2E, not rerun to preserve E2E data | PostgreSQL for database mode | Fresh browser run and migration alignment |
| Public application form | Implemented with server validation and opaque confirmation reference | `app/careers/apply/[id]/page.tsx`, `app/api/careers/applications/**`, `lib/server/recruitment/applications.ts` | Phase 2A DB tests passed in fresh DB run | PostgreSQL/private storage | End-to-end browser verification deferred |
| CV/social links/deduplication | Implemented: required CV, PDF/DOC/DOCX signatures, links, consent, candidate/job uniqueness and idempotency | `lib/server/recruitment/applications.ts`, `lib/server/cv/validation.ts`, schema unique indexes | `phase2a-security`, `phase2a-database` passed | PostgreSQL | Define reapplication policy and retention |
| Private CV storage/download | Implemented local private storage, permissions, generated keys, checksum verification, clean-only policy | `lib/server/cv/storage.ts`, `policy.ts`, `app/api/hr/cv/[id]/route.ts` | Security/scanner/DB tests passed | Writable `CV_STORAGE_DIR` | Object storage/encryption-at-rest and retention strategy |
| Malware scan queue/recovery | Implemented durable leases/retries/backfill and worker | `CvScanJob` schema, `scan-queue.ts`, `scripts/cv-worker.ts` | Queue tests passed; real ClamAV 3 tests passed fresh | ClamAV (local 3310 reachable) | Supervision/alerts and operating runbook |
| HR authentication/session | Implemented in database mode; demo login remains deliberately non-production | `lib/server/auth.ts`, `app/api/auth/[...all]/route.ts`, `app/hr/login/page.tsx` | Security tests passed; historical E2E only | AUTH_SECRET, PostgreSQL | Invitation/reset flow and independent session/security review |
| RBAC/org isolation | Implemented organization-filtered services and membership roles | `lib/server/session.ts`, `lib/server/recruitment/hr*.ts`, HR routes | Phase 2A DB isolation passed fresh | PostgreSQL | A user with multiple memberships is silently assigned earliest membership; organization switching is not implemented |
| Rate limits/logging/health | Implemented, shared DB limiter fails closed; request IDs/redaction/readiness | `rate-limit.ts`, `logger.ts`, `health.ts`, health routes, `middleware.ts` | Rate-limit/observability tests passed fresh | PostgreSQL/scanner/storage | Central logs, metrics, alerting, SLOs |
| Recruiter applicants/notes/stages | Implemented with persisted events and protected APIs | `app/api/hr/applications/**`, `lib/server/recruitment/hr.ts`, database clients | Phase 2A DB tests passed | PostgreSQL | Fresh UI E2E deferred |
| Jobs/publication | Implemented source; organization-scoped CRUD/status | `app/api/hr/jobs/**`, `hr-jobs.ts`, `DatabaseJobsClient.tsx` | Phase 2B test partly blocked by migration when creating interview | PostgreSQL | Repair type/migration gates and rerun |
| Scheduling/reports | Implemented source: interview CRUD/complete/cancel, linkage and report UI | `app/api/hr/interviews/**`, `hr-interviews.ts`, `DatabaseInterview*.tsx` | Phase 2B failed on missing Phase 2E DB column | PostgreSQL | Apply/rehearse migration only under approved change window; rerun |
| Email centre/templates/settings | Implemented database UI/API/outbox; demo history remains labelled simulated | `app/hr/(portal)/email/**`, `app/api/hr/email/**`, `lib/server/email/**` | Most unit tests skipped without DB; DB Phase 2C test failed downstream from migration | PostgreSQL, Resend for delivery | Fix gates; run real controlled delivery |
| Resend delivery/webhooks | Implemented but externally unverified | `provider.ts`, `outbox.ts`, `webhook.ts`, `app/api/webhooks/resend/route.ts` | Fake-provider webhook/retry tests exist; fresh Phase 2C blocked by migration | `EMAIL_*`, `RESEND_API_KEY`, webhook secret/domain, worker | Configure and verify accepted/delivered/bounce/complaint paths |
| Google Calendar OAuth/sync | Implemented but externally unverified | `calendar/oauth.ts`, `crypto.ts`, `sync.ts`, calendar API routes | Crypto/timezone tests passed; DB calendar tests fail due migration drift | Google credentials, encryption key, worker | Live OAuth/event lifecycle, rotation, old-account cleanup |
| Demo interview (`/demo`) | Implemented deterministic ClaimGraph/orchestrator demo | `app/demo/page.tsx`, `lib/orchestrator.ts`, `tests/live-orchestration.test.ts` | 10 orchestration tests passed | None | Keep labelled deterministic, not AI/live voice |
| Live Agora (`/live`) | Source implementation exists: token/session/start/stop/speak/interrupt and browser RTC component | `app/api/agora/**`, `app/api/interview/**`, `components/LiveAgoraInterview.tsx` | 6 auth adapter tests and flow tests passed | Agora credentials/pipeline/microphone | No fresh RTC join, microphone capture or actual TTS verification; prior configuration fault remains historical only |
| Transcript persistence | Implemented API/service with normalized finalized turns, checksums/versioning | `assessment/transcript.ts`, `assessment/service.ts`, transcript API route | No dedicated fresh Phase 2E DB test found | PostgreSQL/live interview transcript source | Blocked locally by unapplied Phase 2E migration; live Agora handoff unverified |
| AI assessment generation | Implemented source, not live verified; calls OpenAI Responses only when configured, validates exact candidate quotes and preserves provenance/review | `assessment/provider.ts`, `validation.ts`, `worker.ts`, schema/migration | Existing suite lacks a Phase 2E test file; typecheck fails in related HR mapping | `ASSESSMENT_PROVIDER`, `OPENAI_API_KEY`, model, worker, PostgreSQL | Fix type error, apply/rehearse migration, add integration/E2E tests, run controlled provider test |
| CI | Workflow implemented, but current checkout would fail quality and migrated integration jobs until fixed | `.github/workflows/ci.yml` | Not run remotely in this audit | GitHub Actions/Postgres/ClamAV/Playwright | Restore green local gates and inspect actual CI history |
| Privacy/operations/backups | Partial documentation and safeguards; no completed production operations evidence | README, `.env.example`, health/logging code | No backup/restore or retention test | Hosting, backups, legal/privacy policy | Retention/deletion, DSAR, backups/restores, threat model, monitoring |

## 4. Phase assessment

| Phase | Current conclusion | Evidence and qualification |
|---|---|---|
| 2A database/auth/applications/storage | **Implemented and partly verified** | Fresh database tests passed for isolation, stages/notes, upload/scan/idempotency. No freshly run browser suite. |
| 2A.2 ClamAV/browser E2E | **ClamAV verified locally; E2E historical only** | Fresh opt-in ClamAV test passed 3/3 against local 3310. Playwright was intentionally not rerun because its setup wipes/reseeds local E2E data. |
| 2A.3 rate limiting/workers/CI/observability | **Implemented and unit/integration verified in part** | Fresh queue/rate-limit/observability tests passed. No active worker health endpoint, deployment supervision, or CI run verified. |
| 2B jobs/scheduling/linkage/email records | **Implemented but not fully verified** | Source exists, but fresh Phase 2B integration test fails when Prisma reads a schema column absent from `ecopanel_test`. |
| 2C real email integration | **Adapter/outbox implemented; live and fresh end-to-end unverified** | No local Resend configuration; fresh DB test blocked by the same migration drift. |
| 2D Google Calendar | **Adapter/OAuth/sync implemented; live and fresh DB verification blocked/unverified** | Timezone/crypto unit tests pass; calendar DB suite fails after the initial missing-column failure. No Google configuration. |
| 2E evidence-grounded AI assessment | **Partially implemented, currently blocked** | New migration and source implement transcript/version/job/provider/evidence validation/review, but migration is unapplied, assessment worker has no package script, typecheck fails, no Phase 2E integration tests exist, and no OpenAI configuration/live run is present. |

## 5. External integrations

| Integration | Local configuration/runtime evidence | Verdict |
|---|---|---|
| PostgreSQL | Local dev/test/E2E URLs point to 127.0.0.1:55432; TCP reachable. Test schema is behind source by one migration. | Reachable, migration drifted |
| ClamAV | Port 3310 is listening through Docker; fresh real-daemon suite passed clean and EICAR tests. | Locally verified adapter/daemon |
| Resend | No Resend/provider variables found in `.env.local`; no worker running; no controlled provider call. | Unconfigured and unverified |
| Google Calendar | No Calendar provider/client/secret/encryption variables found in `.env.local`; no worker running. | Unconfigured and unverified |
| Agora | App/pipeline credential variables are present, but no app on 3200 and no live RTC/audio run was made. | Config present only; live unverified |
| OpenAI assessment | No assessment/OpenAI configuration found locally; worker source exists but is not an npm script. | Unconfigured and unverified |

## 6. Fresh quality results

| Command/check | Result |
|---|---|
| `npm test` with default environment | **PASS:** 12 files passed, 5 skipped; **112 passed, 31 skipped**, 0 failed. Skips are DB-dependent email/calendar/Phase 2 suites and opt-in ClamAV. Vite emitted a CJS Node API deprecation warning. |
| `npm test` with local `TEST_DATABASE_URL` and `CV_CLAMAV_INTEGRATION=1` | **FAIL:** 14 files passed, 3 failed; **136 passed, 7 failed**, 0 skipped. Root cause: `Assessment.transcriptId` absent from `ecopanel_test`; Phase 2B, Phase 2C, and Phase 2D tests cascade from it. Real ClamAV passed 3/3. |
| `npx prisma migrate status` against `ecopanel_test` | **DRIFT:** 6 migrations found; `20261027160000_phase2e_assessment_pipeline` unapplied. No migration was applied. |
| `npx prisma validate` with a local database URL supplied | **PASS:** Prisma schema is valid. The CLI warns that `package.json#prisma` is deprecated for Prisma 7. |
| `npm run typecheck` | **FAIL:** `lib/server/recruitment/hr-interviews.ts:645` unsafe direct cast from `Record<string, HrAssessmentDimension>` to Prisma `InputJsonValue`. |
| `npm run lint` | **PASS:** no lint errors/warnings; Next reported its ESLint plugin was not detected in `.eslintrc.json`. |
| `npm run test:e2e` | **NOT RUN:** its global setup deletes/reseeds `ecopanel_e2e` and `var/cv-storage-e2e`; audit preservation requirements take precedence. Historical results in the old audit are not treated as fresh. |
| Isolated production build | **NOT RUN:** the typecheck failure already blocks the CI build gate. The attempted isolated-build wrapper was rejected before launch by the execution environment because it included cleanup; no build artifact was created. |

## 7. Current runtime status

- `http://127.0.0.1:3200/api/health/live` did not respond; no listener exists on 3200. It was not started or stopped.
- No listener exists on 3201, 3311, or 3312, so no E2E app/test scanner/worker is active.
- Local PostgreSQL port 55432 is reachable. No database rows were intentionally reset or migrated.
- Local ClamAV port 3310 is listening, and was independently verified by fresh EICAR/benign-file tests.
- CV/email/calendar/assessment worker processes were not started, stopped, or restarted. Their health ports are not configured/listening.

## 8. Security status

Implemented controls include HttpOnly/lax session cookies, server-side `getHrContext`, organization-scoped queries, role helpers, immutable application events, DB-backed fail-closed rate limiting, request IDs, sensitive logging redaction, CV signature checking, random storage keys, `0o700` directories/`0o600` files, SHA-256 integrity checks, and default clean-only CV download rules. The public application service validates consent, URL shape, file type/signature and idempotency.

Important qualifications:

- Every current role can manage applications (`canManageApplications` includes `OWNER`, `ADMIN`, and `RECRUITER`); authorization is broad, not a granular permission model.
- `getHrContext` selects the earliest membership; it does not offer an active-organization selector for multi-org users.
- Local filesystem storage is private by path/policy but no actual cloud storage encryption, backup/restore, retention/deletion, DSAR, security review, or penetration test was verified.
- Demo mode is intentionally unauthenticated and must never be used as production evidence.

## 9. Outstanding bugs and limitations

1. The checked-out Prisma schema/migration is ahead of `ecopanel_test`: missing `Assessment.transcriptId` breaks seven fresh integration assertions.
2. TypeScript compilation fails at `hr-interviews.ts:645`.
3. Phase 2E has no dedicated integration/E2E test file, no package script for `assessment-worker`, and no live provider proof.
4. No live Resend, Google OAuth/calendar event, Agora RTC/audio/TTS, or AI assessment request has been exercised.
5. E2E was not fresh-run; its setup is destructive to the dedicated E2E database/storage.
6. Worker supervision, deployment configuration, metrics/alerts, backup/restore, retention, and production privacy/security validation are absent or unverified.
7. Calendar reconnection/account replacement cleanup is not established.

## 10. Remaining configuration

Use `.env.example` as the authoritative name list; never place values in client variables. Key groups are:

- Core: `APP_DATA_MODE`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `AUTH_SECRET`, `CONSENT_VERSION`.
- CV/ClamAV/worker: `CV_STORAGE_DIR`, `CV_SCANNER_PROVIDER`, `CV_CLAMAV_HOST`, `CV_CLAMAV_PORT`, `CV_SCANNER_*`, `CV_WORKER_*`.
- Email: `EMAIL_PROVIDER`, `EMAIL_MODE`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_*_WORKER/LEASE/ATTEMPT` values.
- Calendar: `CALENDAR_PROVIDER`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `CALENDAR_TOKEN_ENCRYPTION_KEY`, optional previous key, and `CALENDAR_*` worker/sync values.
- Rate limiting/bootstrap: `RATE_LIMIT_SECRET`, `RATE_LIMIT_*`, `TRUSTED_PROXY_HEADERS`, `BOOTSTRAP_ADMIN_*`.
- Agora: `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_PIPELINE_ID`, `AGORA_AGENT_TOKEN`, `AGORA_CHANNEL_PREFIX`, `AGORA_AREA`, `LLM_API_KEY`.
- Assessment source additionally reads `ASSESSMENT_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_ASSESSMENT_MODEL`, `ASSESSMENT_*_WORKER/LEASE/ATTEMPT` settings (`lib/server/assessment/config.ts`, `scripts/assessment-worker.ts`). These are not yet documented in `.env.example` and should be added in a future implementation change.

## 11. Recommended next tasks

1. **Repair the release gate first:** review and apply the Phase 2E migration only to approved non-production environments, correct the `InputJsonValue` typing error, then regenerate Prisma and rerun typecheck plus the complete DB suite.
2. Add deterministic Phase 2E integration tests for transcript ingestion, queue lease/retry, provider output rejection, exact-evidence validation, assessment persistence, and reviewer authorization; add an `assessment:worker` package script and documented environment variables.
3. Rerun Playwright only in an explicitly approved disposable/recreated E2E database/storage, and record fresh results.
4. Configure staged Resend and Google credentials, run controlled live acceptance/delivery, webhook, OAuth/create/reschedule/cancel/revoke/rotation tests with supervised workers.
5. Establish production operations: secret manager, supervisor/container orchestration, worker readiness/alerts, backups/restore drills, CV/candidate retention/DSAR policy, audit/security review, and live Agora microphone/TTS acceptance.

## 12. Production-readiness verdict

**Development-ready with material blockers; not staging-ready or production-ready.** The project has meaningful backend source and strong local unit coverage, including a fresh real ClamAV adapter check. However, the checked-out build fails TypeScript, the local integration target is unmigrated, key external integrations are unconfigured/unverified, no running application exists, browser evidence is historical only, and operational/privacy controls are incomplete. The single next task should be restoring migration/schema/typecheck integrity, because every subsequent database verification of scheduling, email, calendar, and Phase 2E depends on it.
