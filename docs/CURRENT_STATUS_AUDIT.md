# EchoPanel Current Status Audit

**Audit date:** 27 October 2026  
**Repository:** `D:\Projects\Ecopanel`  
**Branch:** `master` (latest commit `c18a245`; Phase 2A/2A.2/2A.3/2B/2C/2D changes are uncommitted)  
**Scope:** Phase 2D Google Calendar integration: one-time OAuth with PKCE, encrypted token storage/rotation, durable calendar outbox/worker, idempotent interview create/update/cancel, explicit attendee notification policy, timezone-safe scheduling, visible sync status/retry, and fake-provider tests, on top of Phase 2C transactional email delivery, Phase 2B HR persistence, Phase 2A.3 production hardening (CI, shared PostgreSQL rate limiting, durable CV scan queue/worker, health probes, redacted logging, request IDs), Phase 2A.2 careers/HR workflow, real ClamAV scanning, and browser E2E coverage  
**Runtime note:** no process was listening on `http://localhost:3200` during this audit; it was not started or replaced. Local PostgreSQL and ClamAV containers were used for verification. Phase 2D was verified with a standard production `next build` into `.next`. Browser E2E builds into `.next-e2e` and runs on `3201` with a deterministic test scanner on `3311` and a real `cv-worker` on `3312`; it intentionally does not start an email provider, `email:worker`, Google Calendar, or `calendar:worker`. Temporary verification servers were stopped afterward.

## Executive Verdict

EchoPanel has two distinct operating modes:

1. **Demo mode (default)** retains the deterministic `/demo` experience, the public careers demo, the local HR workspace in development, and the Agora live interview path. Demo recruitment mutations still live in browser memory.
2. **Database mode** adds PostgreSQL/Prisma persistence, Better Auth HR sessions, organization scoping, public job/application APIs, private CV storage, fail-closed malware scanning, HR applicant management, job management, interview scheduling and report linkage, email-centre records, and Phase 2C durable delivery/provider lifecycle.

The Phase 2A application-to-HR-review vertical slice is verified against a real local PostgreSQL instance. Phase 2A.2 adds a real ClamAV adapter, durable scan leases, fail-closed download policy, and a repeatable Playwright browser suite. Phase 2A.3 adds a transactional scan-job queue processed by a separate worker, PostgreSQL-backed shared rate limiting that fails closed, liveness/readiness probes, redacted structured logs with request IDs, and a GitHub Actions pipeline. Phase 2B moves job management, interview scheduling/status/report linkage, and email templates/drafts/queues/settings to authorized PostgreSQL persistence while keeping demo mode intact. Phase 2C adds a transactional email outbox, Resend adapter, `email:worker`, signed Svix webhooks, delivery/bounce/complaint state, bounded retries, ambiguous-send protection, and explicit stage/interview notifications. Phase 2D adds organization-scoped Google Calendar OAuth, AES-256-GCM token storage with key rotation, a durable calendar outbox and `calendar:worker`, deterministic/idempotent event creation, update/cancel propagation, separate attendee notification policy, timezone/DST-safe scheduling, and honest sync status/retry UI. Real ClamAV returned `CLEAN` for a clean PDF and `INFECTED` (`Eicar-Test-Signature`) for EICAR. Seven browser scenarios pass against an isolated database, deterministic test scanner, and the real scan worker.

Phase 2D is not production-ready. Remaining blockers are no verified Google OAuth credentials/redirect URI or live calendar run, no verified Resend credentials/domain or live delivery run, no real assessment-generation pipeline, no deployed metrics/alerting or worker orchestration/runbook, and no privacy/retention review. No paid Agora live session was started.

## Verified Runtime

- Dedicated Compose project: `ecopanel-phase2a`; file: `compose.phase2a.yml`.
- PostgreSQL `16.13` (`postgres:16-alpine`), healthy on `127.0.0.1:55432`.
- ClamAV `clamav/clamav:stable`, healthy on `127.0.0.1:3310`.
- Named PostgreSQL volume: `ecopanel_phase2a_pgdata`.
- Existing unrelated containers (`amx_postgres`, `amx_redis`, `amx_ml_service`) were not touched.
- Databases: `ecopanel_dev`, `ecopanel_test`, and isolated `ecopanel_e2e`.
- Migrations: initial schema, `20261026010000_cv_scan_state`, `20261027090000_phase2a3_rate_limit_scan_jobs`, `20261027120000_phase2c_email_delivery`, and `20261027150000_phase2d_calendar`; all three databases are migrated. Legacy email `Pending` rows migrate to `Queued`; the Phase 2D migration also removes a pre-existing unused `EmailMessage_status_idx` drift so the database matches the schema.
- Seed counts remain stable: **2 organizations | 9 jobs | 9 email templates | 1 MailSettings** in the development database.
- Two real `OWNER` accounts exist for `nexora-labs` and `phase2a-other`; bootstrap refuses to duplicate them.
- The E2E database is prepared and guarded by `scripts/prepare-e2e-db.mjs`; its name must end in `_e2e`.

## Implemented in Phase 2A

### Persistence and schema

- PostgreSQL Prisma schema for organizations, users, sessions, accounts, memberships, invitations, jobs, candidates, applications, CV files, application notes, application events, interviews, assessments, email templates, email activity/outbox, delivery events, and mail settings.
- `CvFile` scan bookkeeping: `scanAttemptId`, `scanStartedAt`, `scanCompletedAt`, `scanAttempts`, and an index on `[scanStatus, scanStartedAt]`.
- Idempotent seed script and one-time owner bootstrap that refuses existing users/organizations, weak passwords, and never logs credentials.
- Database access is centralized through a Prisma singleton and explicit mode/configuration checks.

### Authentication and authorization

- Better Auth email/password sessions with PostgreSQL persistence.
- HR pages require a session and organization membership in database mode. When the database is unavailable, `/hr` renders an explicit access-unavailable state rather than substituting demo data or treating the visitor as anonymous.
- HR APIs require a session and resolve the caller's first organization membership.
- Application list/detail, stage changes, notes, and CV downloads are scoped by `organizationId`.
- Agora and interview mutation APIs require HR access in database mode.
- In production builds, unauthenticated demo interview mutations are rejected and the demo HR workspace is hidden.

### Public careers workflow

- `GET /api/careers/jobs` and `GET /api/careers/jobs/[id]` expose published, public jobs only.
- `POST /api/careers/applications` validates multipart input, requires consent, enforces an idempotency key, validates the CV by file signature, deduplicates candidates by normalized email, prevents duplicate applications, stores the CV privately, and persists the application in a transaction.
- `GET /api/careers/applications/[reference]` returns a limited status summary by opaque public reference.
- Public pages fetch database data in database mode and never substitute demo jobs when the database is unavailable.
- The application confirmation page shows the opaque reference and safe CV status.

### HR workflow

- `/hr/applicants` lists persisted applications with search, stage, job, and pagination filters.
- Applicant detail exposes persisted candidate, job, CV metadata, notes, and activity history.
- Stage changes and notes persist and generate audit events.
- CV downloads require organization ownership, integrity verification, and an allowed scan status.
- The HR shell shows real organization/user details, real counts, sign-out, and explicit copy that no email or calendar provider is connected.

### CV storage and scanning

- Private filesystem storage outside `public` via `CV_STORAGE_DIR`; opaque keys shaped `cv/<orgId>/<uuid>.<pdf|doc|docx>`.
- Files are written with `0o600`; directories use `0o700`; SHA-256 checksums are stored and re-verified before and after scanning.
- PDF, DOC, and DOCX detection uses magic bytes rather than extension or claimed MIME type.
- Path traversal, control characters, and unsafe filenames are rejected or sanitized. CV content is never logged.
- Uploads commit as `PENDING` when a scanner is configured, otherwise `UNSCANNED`. A `CvScanJob` is enqueued in the same transaction, so the HTTP request never waits for the scanner.
- `npm run cv:worker` claims jobs with `FOR UPDATE SKIP LOCKED`, holds renewable leases, recovers expired `RUNNING` jobs from dead workers, and retries transient failures with bounded exponential backoff (five attempts by default). Terminal failures remain visible for operators.
- The worker runs rate-limit bucket cleanup on an interval, exposes optional local `/health` and `/ready` endpoints, and shuts down gracefully on `SIGINT`/`SIGTERM`.
- The scanner adapter supports ClamAV INSTREAM and an optional HTTP scanner. Provider, endpoint, credentials, and timeouts are validated.
- Scans fail closed: unavailable, timed-out, malformed, oversized, HTTP-error, or interrupted scans become `SCAN_FAILED`.
- Durable claim/lease fields prevent concurrent duplicate scan transitions. Conditional updates ensure only one worker finalizes a scan.
- Infected content is deleted and marked `deletedAt`; metadata is retained only as safe scan history.
- Downloads are limited to `CLEAN` files by default. `PENDING`, `UNSCANNED`, `INFECTED`, and `SCAN_FAILED` are blocked. `CV_ALLOW_UNSCANNED_DOWNLOADS=true` permits only `UNSCANNED` files in non-production development.
- `npm run cv:scan-retry` backfills missing jobs and can requeue terminal failures with `-- --requeue-failed`.

### Phase 2A.3 rate limiting, observability, and CI

- Shared rate limiting uses PostgreSQL `RateLimitBucket` rows and a single atomic upsert per request, so limits hold across processes and restarts. Subjects are HMAC-SHA256 hashed; raw IP addresses, emails, and user agents are not stored.
- The limiter fails closed: if its storage is unavailable or unmigrated, sensitive routes return HTTP `503 RATE_LIMIT_UNAVAILABLE` without processing the request. HTTP `429` responses include `Retry-After`.
- Forwarded IP headers are ignored unless `TRUSTED_PROXY_HEADERS=true` (or `RATE_LIMIT_TRUST_PROXY=true`); otherwise the limiter uses a hashed user-agent fingerprint.
- Dedicated policies cover sign-in, password reset, other auth mutations, public applications, application status, CV downloads, HR reads/mutations, and interview session/token/start/stop/mutation actions. Policies are tunable with `RATE_LIMIT_*_MAX`.
- Better Auth's in-memory limiter is disabled; auth POSTs pass through the shared limiter instead.
- `GET /api/health/live` always answers when the process is running. `GET /api/health/ready` returns `503` only for required database or CV-storage failures and reports scanner outages as `degraded`.
- Middleware generates or validates `x-request-id` for `/api/*`; logs are single-line JSON and redact credentials, cookies, tokens, email addresses, database URLs, CV content, and candidate/HR fields by key.
- `.github/workflows/ci.yml` defines quality (typecheck, lint, unit tests, build), PostgreSQL integration/migration tests, Playwright E2E with the scan worker, and a real-ClamAV service-container job.

### Phase 2B job, interview, and email persistence

- Job management uses organization-scoped server services and authorized APIs for list/detail/create/update/status. Publishing sets `publicVisible=true` and `publishedAt`; closing or drafting removes public visibility. Public careers reads only `Published` jobs with `publicVisible=true`.
- The database jobs UI preserves the existing editor, detail, and list experience, including publish/close/draft actions and public preview links, without changing the public careers flow.
- Interview scheduling persists the linked application, job, candidate, round, start time, duration, timezone, notes, and status. Rescheduling updates the existing record, and cancel/complete transitions write application events. Scheduling moves the application to the `Interview` stage.
- Interview detail and report pages read persisted records. Completing an interview does **not** invent an assessment; the report page states when no report is linked.
- An authenticated assessment endpoint persists only a complete, validated assessment payload for a completed interview in the same organization. It stores dimension evidence, provenance (`source`, `isDemo: false`), and an application event. No assessment generator or seeded-assessment fallback is present.
- Email templates support list/detail/create/update with the existing placeholder allowlist. Compose supports `Draft` and durable `Queued` records. Queuing creates an application event that states delivery depends on provider configuration and the worker.
- Email settings persist sender identity and signature. Provider name, mode, sender, webhook status, and configuration problems are derived honestly from environment configuration; credentials are never stored in PostgreSQL.
- All Phase 2B APIs require an HR session, enforce organization scope, use `hrRead`/`hrMutation` rate limits, and require `canManageApplications` for mutations.

### Phase 2C transactional email delivery

- `EmailMessage` tracks kind, interview linkage, provider name/mode, provider message id, reply-to, attempts/max attempts, availability, worker lease, last attempt, and accepted/delivered/bounced/complained/failed/cancelled timestamps. `EmailDeliveryEvent` stores provider event ids uniquely for webhook idempotency.
- Application receipts, stage updates, shortlisting, offers, rejections, interview invitations, reschedules, cancellations, and 24-hour reminders are inserted in the same transaction as the business change. Stage and interview notifications are explicit; no message is queued unless the caller selects it. Reminders already inside their send window are skipped.
- `lib/server/email/outbox.ts` claims `Queued` rows with `FOR UPDATE SKIP LOCKED`, increments attempts, records a lease, sends with a stable Resend idempotency key, and updates the record only when the worker still owns it.
- Transient `408`, `429`, and `5xx` provider responses retry with bounded exponential backoff up to `EMAIL_MAX_ATTEMPTS`. Permanent failures stop. Ambiguous outcomes become `Failed` with `AMBIGUOUS_SEND` and are never retried automatically; a worker whose lease expires while `Sending` is recovered the same way. Failed messages without a provider id and without `AMBIGUOUS_SEND` can be manually requeued.
- `POST /api/webhooks/resend` verifies raw-body Svix signatures and timestamp tolerance, rejects unconfigured secrets, records each event once, and applies status/rank ordering so older or duplicate events cannot regress newer state. A verified delivery can resolve an ambiguous failure.
- `Sent` means Resend accepted the message. `Delivered` requires a verified webhook. `Bounced` and `Complained` are terminal provider states. Email UI uses these distinctions and labels seeded demo history separately.
- `npm run email:worker` is separate from the web process and processes the email outbox; it can expose local `/health` and `/ready` endpoints and shuts down after the in-flight attempt.
- Test mode redirects every message to `EMAIL_TEST_RECIPIENT`; live mode is never claimed without credentials and a verified sender domain. Rate limits cover compose/retry (`emailSend`) and webhook ingress (`emailWebhook`).

### Phase 2D Google Calendar synchronization

- `CalendarConnection`, `CalendarOAuthState`, and the extended `CalendarEvent` outbox are persisted and organization-scoped. Disconnecting clears encrypted tokens and skips queued work; reconnecting resumes upcoming scheduled interviews and skipped cancellations.
- OAuth uses Google `calendar.events` plus `openid email`, offline access, `prompt=consent`, PKCE S256, and a one-time 10-minute state bound to the authenticated user, organization, and session. The PKCE verifier is encrypted; OAuth credentials and tokens never reach the browser.
- Access and refresh tokens are encrypted with AES-256-GCM using organization/provider token-specific AAD. `CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS` enables controlled key rotation; token refresh re-encrypts both tokens with the current key.
- The worker uses durable outbox rows with conditional version-matched claims, leases, interrupted-lease recovery, bounded exponential retries, max-attempt exhaustion, and version guards so a reschedule/cancel that arrives during processing wins over stale results.
- Google event IDs are deterministic and base32hex-safe (`ecopanel` + 32 SHA-256 hex characters), so duplicate create requests resolve through Google `409` and fetch the existing event. Updates and cancellations use the saved external ID, and a missing external event is treated as an idempotent cancellation.
- Scheduling accepts an explicit IANA timezone. Wall-clock date/time is converted to a UTC instant with DST-gap rejection instead of browser-local parsing. Interview list/detail/reschedule/cancel copy displays the stored wall time in its timezone.
- Email notification and Google Calendar attendee notification are separate explicit choices. `sendUpdates=none|all` is derived from the latter. The UI labels attendee notification as requested, not delivered; worker success confirms the event change accepted by Google, not individual attendee email delivery.
- `CalendarConnectionCard` and `CalendarSyncStatus` expose connection state, provider configuration problems, queue counts, pending/failed sync badges, event links, and manual retry. Disconnected/skipped states are labelled honestly and never presented as calendar-invited.
- `npm run calendar:worker` is separate from the web/email/CV workers. It exposes optional local `/health`, `/live`, `/healthz`, `/ready`, and `/readyz` endpoints and shuts down gracefully.
- `tests/phase2d-timezone.test.ts`, `tests/phase2d-crypto.test.ts`, and `tests/phase2d-calendar.test.ts` cover DST conversion, encryption/AAD/rotation, disconnected skip, create/update payloads, retry, cancellation, encrypted OAuth tokens, one-time state, and reconnect backfill with a fake provider.

## Real ClamAV Verification

- The ClamAV container is healthy and reachable at `127.0.0.1:3310`.
- A real `ClamAvCvScanner` INSTREAM call returned `CLEAN` for a valid PDF.
- The same adapter returned `INFECTED` with `Eicar-Test-Signature` for an EICAR payload.
- The browser E2E suite separately confirms the API boundary returns HTTP `410` for an infected record after quarantine.
- The automated browser suite uses a deterministic HTTP test scanner on port `3311`, not ClamAV. That keeps browser tests repeatable and is not presented as real-scanner evidence.

## Browser E2E Verification

`npx playwright test` completed **7/7 passing** against an isolated `.next-e2e` build, `ecopanel_e2e`, and a separate CV storage directory:

1. Candidate submits a clean CV, receives confirmation, HR downloads the clean file, changes stage, adds a note, and another organization cannot view the application or CV.
2. An infected CV is blocked; HR never receives a download link; the API returns HTTP `410`.
3. Duplicate application for the same role and email is rejected with a visible error.
4. Public validation errors appear without submitting.
5. Anonymous `/hr/applicants` access redirects to `/hr/login`.
6. An unavailable applicant-data API renders an explicit error and does not show a misleading empty state.
7. HR creates and publishes a job, confirms it is visible to public careers and hidden from another organization, verifies Google Calendar is shown as not connected, schedules and completes an interview, confirms the detail page reports calendar sync is not connected, verifies the report page honestly shows no linked report, and queues an email that is persisted as `Queued` with no `Sent` status. No provider, email worker, or calendar worker runs in this suite.

The suite now runs the real `cv-worker` on port `3312`; the confirmation and HR applicant pages poll briefly while a scan is `PENDING`, so assertions wait for the worker's verdict rather than relying on in-request scanning. Authentication still uses pre-created owner/other-organization storage states while exercising real sessions. The suite covers the browser workflow; the earlier HTTP-level login, sign-out, and session invalidation checks remain valid.

## HTTP and Database Verification

A production Phase 2A build was started in database mode and exercised with real HTTP requests and a real Better Auth session cookie:

- A synthetic application was accepted with HTTP `201`.
- Retrying the same idempotency key returned HTTP `200`, `duplicate=true`, and the same public reference. A new key for the same candidate/job returned HTTP `409`.
- Public status lookup by opaque reference returned HTTP `200`.
- A real Better Auth sign-in succeeded; `/api/auth/get-session` returned the owner, and `/hr` returned HTTP `200` with `Nexora Labs` rendered.
- Stage update to `Shortlisted` and creation of a private note succeeded and persisted.
- The second organization saw list total `0`; detail and CV requests returned HTTP `404`.
- Sign-out invalidated the session; the old cookie no longer accessed `/hr`.
- After stopping only `ecopanel-phase2a-postgres-1` and restarting it, jobs, the persisted application, stage, note, and CV metadata were intact.
- Database-down checks returned explicit `503` responses, with no demo fallback; `/api/auth/*` returned `503 AUTH_UNAVAILABLE`.

Phase 2A build smoke on port `3202` with `.next-phase2a`, database mode, and real ClamAV configured:

- `GET /api/careers/jobs` returned HTTP `200`.
- `/hr/login` returned HTTP `200`.
- Anonymous `GET /api/hr/applications` returned HTTP `401`.

Security smoke checks:

- Unauthenticated `/api/agora/session`, `/api/agora/token`, `/api/agora/start`, and `/api/interview/analyze` returned HTTP `401`.
- A request for the private CV storage key through the public web root returned HTTP `404`.
- A scan of the production client bundle found neither `AUTH_SECRET` nor the database password.

## Test and Quality Snapshot

```text
npm test            PASS  17 files (16 run, 1 opt-in skipped), 140 tests passed, 3 skipped (database suites included)
Playwright E2E      PASS  7 tests passed with the real scan worker; calendar disconnected UI asserted; no email/calendar provider or workers
typecheck           PASS  tsc --noEmit
lint                PASS  next lint, no warnings or errors
production build    PASS  next build
migrations          PASS  all three databases on 20261027150000_phase2d_calendar
real ClamAV         PASS  CLEAN for PDF; INFECTED for EICAR
live Resend         NOT VERIFIED  no credentials or verified sender domain
live Google Calendar NOT VERIFIED  no OAuth client, redirect URI, or encryption key
existing app        NOT RUNNING  port 3200 was not started or replaced
```

## Not Yet Verified

- **Real ClamAV through the full browser suite:** the automated browser suite uses the deterministic test scanner. Real ClamAV was verified through the adapter and API boundary, but the browser suite does not run against ClamAV.
- **Paid Agora session:** unauthenticated interview APIs were verified as rejected, but no Agora voice/video session was started, so paid external usage was avoided.
- **Live Resend delivery:** adapter, outbox, retries, signed webhook verification, lifecycle ordering, and explicit notification tests pass, but no real Resend API call, verified sender domain, or live webhook delivery was exercised. No valid credentials were available.
- **Live Google Calendar synchronization:** OAuth state/PKCE, encrypted tokens, deterministic event payloads, create/update/cancel, retry, disconnected skip, and reconnect backfill pass with fake providers and database integration tests. No real Google OAuth client, redirect URI, verified account, encryption key, or live event/invitation was exercised, and no `calendar:worker` ran against Google.
- **Calendar account replacement:** reconnecting a different Google account can leave events previously created in the old calendar; no cross-account cleanup or migration was verified.
- **Calendar key rotation runbook:** previous-key decryption and current-key re-encryption are tested at the crypto/token-refresh level, but no staged production rotation was run.
- **Assessment generation:** the persistence endpoint and report linkage are tested, but no pipeline generates a real assessment from an interview. No report is fabricated when none exists.
- **Worker orchestration and alerting:** durable scan, email, and calendar queues and restart-safe workers exist, but no process supervisor, autoscaling, metrics export, or alerting for sustained failures was verified.
- **Scan-failure recovery SLA:** no automated alert or operator runbook has been exercised for sustained ClamAV downtime.
- **Multi-instance behaviour:** shared PostgreSQL state is designed for multiple app/worker instances, but no multi-instance load or failover test was run.
- **GitHub-hosted CI:** the workflow is defined and jobs were reproduced locally, but it has not yet run on GitHub.

## Remaining Gaps

- **Demo-only modules:** none of the listed secondary modules remain demo-only in database mode. Demo mode still renders seeded, in-memory records by design.
- **Email:** provider delivery, retries, signed webhook lifecycle, and explicit candidate notifications are implemented. Live delivery remains unverified without verified credentials/domain; production needs a supervised email worker, domain authentication (SPF/DKIM/DMARC), and webhook secret management.
- **Multi-organization accounts:** HR context uses the user's earliest membership; there is no organization switcher.
- **Interview linkage:** applications are linked to persisted interviews and assessments. Transcripts and a real assessment-generation pipeline are still missing.
- **Calendar and notifications:** email notifications and Google Calendar event synchronization are integrated with explicit opt-in and honest pending/failed states. Live Google credentials, account-replacement cleanup, and production key rotation remain unverified; worker success confirms event synchronization, not individual attendee email delivery.
- **Operations:** metrics/alerting, centralized log shipping, worker supervision, retention/deletion automation, and a privacy review are still missing. Rate-limit storage adds a hard dependency on PostgreSQL for sensitive requests.
- **CI execution:** the workflow is checked in but has not yet been observed green on GitHub.
- **Migration tooling warning:** Prisma warns that the `package.json#prisma` configuration is deprecated; migrate to a Prisma config file before Prisma 7.

## Critical Risks

1. **Scanner availability affects recruiter downloads.** Fail-closed behavior is intentional, but sustained ClamAV downtime blocks new downloads until scans succeed or an operator retries.
2. **Email acceptance is not delivery.** `Sent` means the provider accepted the message; only a verified webhook proves delivery. Ambiguous sends are deliberately not retried automatically and require dashboard review. Seeded historical records are labelled separately and are not delivery evidence.
3. **Shared rate limiting depends on PostgreSQL.** The limiter fails closed, so a database outage intentionally blocks sensitive routes rather than admitting unthrottled traffic. Alerting and capacity planning must account for this.
4. **Worker availability.** Uploads, queued email, and calendar work can succeed without workers, but CV downloads, email delivery, and calendar synchronization depend on supervised `cv-worker`, `email:worker`, and `calendar:worker` processes. Stopped workers do not lose durable outbox rows, but their effects stall.
5. **Browser E2E determinism uses a test scanner.** It proves browser workflow and policy behavior, not real malware-engine integration. The E2E suite does not start an email provider, calendar provider, `email:worker`, or `calendar:worker`.
6. **Calendar authorization and keys are operational secrets.** Losing `CALENDAR_TOKEN_ENCRYPTION_KEY` makes stored tokens unreadable, and removing the previous key before refresh/rotation completes forces reauthorization. Reconnecting a different Google account may leave events in the old calendar. Neither credential nor account-replacement recovery has been exercised against Google.
7. **Uncommitted work.** Phase 2A/2A.2/2A.3/2B/2C/2D remain uncommitted; review the diff and decide what to commit before handoff.

## Recommended Next Stage

1. Review and commit the verified Phase 2A/2A.2/2A.3/2B/2C/2D source, tests, Compose file, migrations, CI workflow, and documentation.
2. Let the GitHub Actions workflow run on the remote and fix any hosted-runner differences.
3. Deploy supervised CV, email, and calendar workers and add metrics/alerts for job age, retry/terminal failures, ambiguous sends, webhook failures, scanner/provider health, token reauthorization, rate-limit storage errors, and readiness.
4. Run the browser suite against real ClamAV in staging, including clean download, EICAR block, scanner outage, and retry recovery.
5. Configure a verified Resend sender domain and webhook secret in staging; run controlled test/live sends covering acceptance, delivery, bounce/complaint, 429 retry, ambiguous timeout, and duplicate/out-of-order webhooks.
6. Configure a verified Google OAuth client, HTTPS redirect URI, and production encryption key in staging; run controlled create/reschedule/cancel, `sendUpdates=none|all`, revoke/reauthorize, key rotation, and account-replacement checks with `calendar:worker`. Do not claim delivery until Google confirms and the worker records success.
7. Connect a real assessment-generation pipeline and a transcript source; keep the existing honest no-report state when either is unavailable.
8. Add audit log export, retention/deletion policy, and a privacy review before production.

## Repository Notes

- Existing server: port `3200` was not running during this audit and was not started or replaced. The standard `.next` production build now includes Phase 2D.
- Standard production build: `.next`; E2E build: `.next-e2e`. Both are ignored by Git.
- Local PostgreSQL: Compose project `ecopanel-phase2a`, port `55432`; ClamAV port `3310`.
- Local-only credentials live in ignored `.env.postgres.local`. Application secrets and database URLs live in ignored `.env.local`; E2E settings live in ignored `.env.e2e.local`. No values are reproduced in this document.
- New Phase 2A/2A.2/2A.3/2B/2C/2D tests: `tests/phase2a-security.test.ts`, `tests/phase2a-database.test.ts`, `tests/phase2a-cv-scanner.test.ts`, `tests/phase2a3-rate-limit.test.ts`, `tests/phase2a3-scan-queue.test.ts`, `tests/phase2a3-observability.test.ts`, `tests/phase2b-database.test.ts`, `tests/phase2c-email-delivery.test.ts`, `tests/phase2d-timezone.test.ts`, `tests/phase2d-crypto.test.ts`, `tests/phase2d-calendar.test.ts`, `tests/real-clamav.test.ts`, and `tests/e2e/recruitment.spec.ts`.
- New Phase 2B server files: `lib/server/recruitment/hr-jobs.ts`, `hr-interviews.ts`, and `hr-email.ts`; APIs under `app/api/hr/jobs`, `app/api/hr/interviews`, and `app/api/hr/email`.
- New Phase 2C server files: `lib/server/email/config.ts`, `provider.ts`, `render.ts`, `outbox.ts`, `webhook.ts`, and `notifications.ts`; `app/api/webhooks/resend/route.ts`; `app/api/hr/email/messages/[id]/retry/route.ts`; `lib/email-status.ts`; and `scripts/email-worker.ts`.
- New Phase 2D server files: `lib/server/calendar/config.ts`, `crypto.ts`, `types.ts`, `provider.ts`, `oauth.ts`, `connection.ts`, `service.ts`, and `sync.ts`; APIs under `app/api/hr/calendar`; `lib/timezone.ts`; and `scripts/calendar-worker.ts`.
- New Phase 2D UI files: `components/hr/CalendarConnectionCard.tsx` and `CalendarSyncStatus.tsx`, integrated into the existing schedule/detail dialogs.
- New Phase 2B/2C UI files: `components/hr/DatabaseJobsClient.tsx`, `DatabaseJobEditor.tsx`, `DatabaseJobDetail.tsx`, `DatabaseScheduleClient.tsx`, `DatabaseScheduleDialogs.tsx`, `DatabaseInterviewDetail.tsx`, `DatabaseInterviewReport.tsx`, `DatabaseEmailLog.tsx`, `DatabaseEmailDetail.tsx`, `DatabaseEmailTemplatesClient.tsx`, `DatabaseTemplateEditor.tsx`, `DatabaseEmailSettingsClient.tsx`, and `DatabaseComposeClient.tsx`.
- New operational files: `lib/server/cv/scan-queue.ts`, `scripts/cv-worker.ts`, `scripts/email-worker.ts`, `scripts/calendar-worker.ts`, `lib/server/health.ts`, `app/api/health/live/route.ts`, `app/api/health/ready/route.ts`, `middleware.ts`, `scripts/assert-safe-db.mjs`, and `.github/workflows/ci.yml`.
- Required environment and setup instructions are in `.env.example` and `README.md`.
- Demo behavior remains under `components/DemoDataProvider.tsx`; database behavior is implemented under `lib/server/`.
- No commit, push, deploy, reset, clean, or destructive Git operation was performed.
- No secret material was written to tracked files.
