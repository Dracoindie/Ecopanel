# EchoPanel read-only audit — 2026-10-28 (evening)

Labels: **V** = VERIFIED now · **I** = INFERRED from code · **NC** = NOT CHECKED. No secrets, URLs with credentials, tokens or invitation links appear here. Nothing was started, stopped, built, migrated or written (except this file).

> **Scope note (V):** `docs/CURRENT_PROJECT_HANDOVER.md` has no "Desired end-user workflow" section and no 11-step list (its §2 is *Architecture*, §8 *Security*, env vars are in §10, §12 names no files). §2 below audits the files named in its §2–§3; §3 uses an **11-step workflow reconstructed from the code** (marked as such); §5 uses the env list in its §10.

## 1. Repo state

| Item | Finding | |
|---|---|---|
| Branch / HEAD | `master` @ `c18a245` "Fix Agora ConvoAI request authentication" | V |
| Working tree | 29 modified + 72 untracked entries (253 files expanded, excl. `.claude*/.swarm`); **nothing committed since c18a245** | V |
| `lib/orchestrator.ts` | **965 lines** (project guideline: <500) | V |
| Stray root files | 3 files named ``t `n--- … ---``, `{console.table(r)`, `patch_live.py`, `live-smoke.*.log`, `npm-install.*.log` | V |

| Area | Uncommitted files | Examples |
|---|---|---|
| HR | 89 | `app/hr/**`, `app/api/hr/**`, `components/hr/**`, `lib/server/recruitment/hr*.ts`, auth |
| Other | 61 | CI workflow, health routes, `components/ui/**`, `middleware.ts`, docs, scripts |
| Tests | 20 | `tests/e2e/**`, `live-echo-guard`, `live-orchestration`, phase2* suites |
| Live voice | 17 | `components/LiveAgoraInterview.tsx`, `LiveInterviewView.tsx`, `lib/live-helpers.ts`, `app/api/agora/**`, `app/api/interview/**` |
| Assessment | 13 | `lib/server/assessment/**`, `scripts/assessment-worker.ts` |
| Invitations | 11 | `app/interview/join`, `api/candidate/**`, `candidate-access.ts`, `interview-access.ts` |
| Careers | 11 | `app/careers/**`, `app/api/careers/**` |
| Email | 11 | `lib/server/email/**`, `app/api/webhooks/resend` |
| Calendar | 10 | `lib/server/calendar/**` |
| Prisma | 7 | `schema.prisma`, 7 migrations, `bootstrap-admin.ts` |
| Orchestrator | 3 | `lib/orchestrator.ts`, `lib/interview.ts`, `lib/types.ts` |

## 2. Handover accuracy (`docs/CURRENT_PROJECT_HANDOVER.md`)

**Paths (V):** every path named in §2–§3 exists. 24 are written as bare/relative names; real paths: `DatabaseJobsClient.tsx`→`components/hr/`, `DatabaseInterview*.tsx`→`components/hr/DatabaseInterviewDetail.tsx`, `…Report.tsx`; `assessment/*.ts`, `calendar/oauth.ts`, `crypto.ts`, `sync.ts`→`lib/server/{assessment,calendar}/`; `health.ts`, `logger.ts`, `rate-limit.ts`→`lib/server/`; `policy.ts`, `scan-queue.ts`→`lib/server/cv/`; `outbox.ts`, `webhook.ts`→`lib/server/email/`; `hr-interviews.ts`, `hr-jobs.ts`→`lib/server/recruitment/`; `worker.ts`→`lib/server/assessment/`; `provider.ts`/`validation.ts` are ambiguous (3 and 2 matches). `/demo`, `/live` are routes (`app/demo/page.tsx`, `app/live/page.tsx`). §12 names no files.

**Claims now wrong or outdated:**

| # | Handover claim | Current fact | |
|---|---|---|---|
| 1 | `ecopanel_test` one migration behind (6 found, phase2e unapplied) | 7 found, 7 applied, "up to date" | V |
| 2 | `npm run typecheck` fails at `hr-interviews.ts:645` | Typecheck passes (exit 0) | V |
| 3 | 7 DB integration tests fail | Full suite 276 passed / 0 failed earlier today; **not rerun in this audit** | NC |
| 4 | No live RTC join, mic capture or TTS verified | 5 live sessions, 4 saved transcripts from real phone tests in `ecopanel_test` | V |
| 5 | `/demo` is built on `lib/orchestrator.ts` | `app/demo` → `components/InterviewRoom.tsx` → `lib/interview.ts`; orchestrator is used only by live/analyze/assess/start | V |
| 6 | "10 orchestration tests passed" | 18 tests now | V |
| 7 | `AGORA_AGENT_TOKEN`, `LLM_API_KEY` are required Agora config | No code reads either variable | V |
| 8 | Runtime target is port 3200 | Isolated test app is on 3401; demo port is 3400 | V |
| 9 | Transcript "live Agora handoff unverified" | Candidate finish → transcript + assessment job verified 3× today | V |
| 10 | No Phase 2E tests | `assessment-validation`, `hr-assessment-dimensions`, `candidate-invitation-database` (finish→queue) exist; no worker integration test | I |
| — | Still true: no `assessment:worker` npm script; assessment env vars absent from `.env.example` | | V |

## 3. Feature map (11-step workflow — RECONSTRUCTED from code, not from a handover)

| # | Step | UI / API (real paths) | DB models | Status | Evidence / caveats |
|---|---|---|---|---|---|
| 1 | HR signs in | `app/hr/login`, `app/hr/forgot-password`; `api/auth/[...all]` | User, Session, Account, Membership | COMPLETE (db mode) | Better Auth, public sign-up disabled (I). Demo login branch in `app/hr/login` (I). Password reset NC |
| 2 | HR creates/publishes job | `app/hr/(portal)/jobs{,/new,/[id],/[id]/edit}`; `api/hr/jobs`, `jobs/[id]/status` | Job | COMPLETE | Org-scoped CRUD `hr-jobs.ts` (I); 8 jobs in test DB (V) |
| 3 | Candidate browses careers | `app/careers`, `careers/jobs/[id]`; `api/careers/jobs{,/[id]}` | Job | COMPLETE | Demo fallback branch in pages (I) |
| 4 | Candidate applies (CV, links, consent) | `app/careers/apply/[id]`, `careers/applications/[id]`; `api/careers/applications{,/[reference]}` | Candidate, Application, CvFile | COMPLETE | Signature checks, idempotency (I); `CONSENT_VERSION` unset → code default (I) |
| 5 | CV malware scan | `scripts/cv-worker.ts`, `lib/server/cv/scan-queue.ts` | CvScanJob, CvFile | PARTIAL | ClamAV container healthy (V) but 3401 readiness reports scanner **disabled**, cv-worker not running, 0 CvScanJob rows (V) |
| 6 | HR reviews applicants, notes, stages | `app/hr/(portal)/applicants{,/[id]}`; `api/hr/applications/**`, `api/hr/cv/[id]` | Application, ApplicationNote, ApplicationEvent | COMPLETE | `DemoApplicantDetailClient` demo branch (I) |
| 7 | HR schedules interview (+calendar) | `app/hr/(portal)/schedule`, `interviews/[id]`; `api/hr/interviews/**`, `api/hr/calendar/**` | Interview, CalendarConnection, CalendarEvent | PARTIAL | Interviews work (I); all 5 CalendarEvent rows `Skipped`, Google vars missing (V) |
| 8 | HR issues one-time join link + email | `api/hr/interviews/[id]/invitation` | CandidateInvitation, EmailMessage | PARTIAL | Link issue/redeem verified 4× (V). Email only **queued**: `EMAIL_PROVIDER` missing → disabled; worker not run (V) |
| 9 | Candidate joins live AI interview | `app/interview/join` → `app/live`; `api/candidate/invitations/redeem`, `api/agora/{token,start,stop,session}`, `api/interview/{analyze,speak,interrupt}` | CandidateSession, LiveInterviewSession | PARTIAL (works; newest plan untested) | 4 phone sessions with audible questions (V). **Hardcoded** `experienceLevel: "Mid"` (`app/interview/join/page.tsx:63`); analysis is deterministic `analyzeAnswerLocally` (no LLM); job description used as JD (throwaway jobs give "Live, Test, Engineer" phrasing, V); Agora Console greeting precedes EchoPanel's (I) |
| 10 | Transcript saved; AI assessment generated | `api/candidate/interview/finish`; `lib/server/assessment/**`, `scripts/assessment-worker.ts` | InterviewTranscript, AssessmentJob, Assessment | PARTIAL / STUB | Transcript + job saved (V). Generation: `ASSESSMENT_PROVIDER` defaults to `disabled` → worker returns `ASSESSMENT_PROVIDER_UNCONFIGURED` (I); no npm script |
| 11 | HR reviews report; candidate notified | `app/hr/(portal)/interviews/[id]/report`; `api/hr/interviews/[id]/{assessment,assessment/review,assessment/retry,transcript}` | Assessment, EmailMessage | PARTIAL | Report/review routes exist (I); no AI content without provider; the new closing line promises a confirmation email that nothing sends automatically (I) |

TODO/FIXME/mock scan of `app`, `components`, `lib`, `scripts`: **no matches** (V). Demo-mode branches exist in ~40 files (`useIsDatabaseMode`, `DemoDataProvider`, `demo-service`) — by design (V).

## 4. Database (`ecopanel_test`, read-only)

| Item | Value | |
|---|---|---|
| Prisma models | 28: Organization, User, Session, Account, Verification, Membership, Job, Candidate, Application, CvFile, CvScanJob, RateLimitBucket, ApplicationNote, ApplicationEvent, Interview, Assessment, InterviewTranscript, AssessmentJob, EmailTemplate, EmailMessage, EmailDeliveryEvent, MailSettings, CalendarConnection, CalendarOAuthState, CalendarEvent, LiveInterviewSession, CandidateInvitation, CandidateSession | V |
| Migrations | 7 dirs; 7 applied, 0 rolled back; `prisma migrate status`: "Database schema is up to date" | V |
| Databases present | `ecopanel_dev`, `ecopanel_e2e`, `ecopanel_test` (dev not queried further) | V |

| Table | Rows | Table | Rows |
|---|---|---|---|
| Job | 8 | LiveInterviewSession | 5 (all STOPPED) |
| Application | 8 | InterviewTranscript | 4 |
| Interview | 8 | Assessment | 2 |
| CandidateInvitation | 7 (1 unused, unexpired) | AssessmentJob | 4 |
| CandidateSession | 6 (0 active) | EmailMessage (outbox) | 7 |
| CvScanJob | 0 | CalendarEvent | 5 (all Skipped) |

**Open-state rows (V):** AssessmentJob `Pending` ×2 (oldest created ~2 h 34 m before audit; provider `disabled`; both are live-test throwaway rows). No live sessions RUNNING/STARTING. No email `Queued/Sending/Retrying` (live-test emails were cancelled earlier today to protect them from test workers).

## 5. Environment (`.env.local`, presence/format only)

| Variable | Status | Variable | Status |
|---|---|---|---|
| APP_DATA_MODE | **MISSING** (defaults to demo) | AGORA_APP_ID | PRESENT |
| NEXT_PUBLIC_APP_URL | PRESENT (localhost:3000; 3401 overrides at launch) | AGORA_APP_CERTIFICATE | PRESENT |
| DATABASE_URL | PRESENT (points to **ecopanel_dev** @55432) | AGORA_PIPELINE_ID | PRESENT |
| AUTH_SECRET | PRESENT | AGORA_CHANNEL_PREFIX | PRESENT |
| CONSENT_VERSION | MISSING | AGORA_AREA | PRESENT |
| CV_STORAGE_DIR | PRESENT | AGORA_AGENT_TOKEN | MISSING (unused by code) |
| CV_SCANNER_PROVIDER / CV_CLAMAV_HOST / _PORT / CV_SCANNER_URL | MISSING | LLM_API_KEY | MISSING (unused by code) |
| EMAIL_PROVIDER / EMAIL_MODE / RESEND_API_KEY / EMAIL_FROM / EMAIL_REPLY_TO / EMAIL_WEBHOOK_SECRET | MISSING | ASSESSMENT_PROVIDER / OPENAI_API_KEY / OPENAI_ASSESSMENT_MODEL | MISSING; also absent from `.env.example` |
| CALENDAR_PROVIDER / GOOGLE_CALENDAR_* / CALENDAR_TOKEN_ENCRYPTION_KEY | MISSING | RATE_LIMIT_SECRET | MISSING (falls back to AUTH_SECRET) |
| TRUSTED_PROXY_HEADERS | MISSING | `.env.test.local` TEST_DATABASE_URL | PRESENT (ecopanel_test) |
| | | `.env.e2e.local` E2E_DATABASE_URL | PRESENT (ecopanel_e2e) |

No variable LOOKS INVALID. Files: `.env.local`, `.env.test.local`, `.env.postgres.local`, `.env.e2e.local` exist and are **git-ignored**; `.env` absent; `.env.example` tracked (modified) (V).

## 6. Runtime

| Item | Finding | |
|---|---|---|
| Memory | 15.7 GB total, **2.9 GB free (18%)**. Top: chrome 1.55 GB, svchost 1.34 GB, Wispr Flow 0.84 GB, ChatGPT 0.70 GB, bdservicehost 0.58 GB | V |
| Docker | `ecopanel-phase2a-postgres-1` healthy (127.0.0.1:55432); `ecopanel-phase2a-clamav-1` healthy (127.0.0.1:3310); other project `amx_*` on 5432/6379/8000 untouched | V |
| Ports | 3400 **not listening**; 3401 node PID 48664 (started 17:39); 55432 and 3310 via Docker | V |
| 3401 build | Serves `.next-live` BUILD_ID `g9r42NVoQA0HH5cIP86TU` (built 17:38); readiness `ready`, DB ok | V |
| Latest orchestrator in build? | **NO.** `lib/orchestrator.ts` changed 18:10; build lacks resume, GitHub/LinkedIn, confirmation-email closing and near-repeat fix (has older closing + repeat guard) | V |
| Tunnel | `cloudflared` PID 39968 running since 14:41; public `/api/health/live` → 200; tunnel host is baked into the 3401 server build (= NEXT_PUBLIC_APP_URL for links) | V |
| 3401 log | `scratchpad/server-3401.log` (file-based) | V |

## 7. Agora

No `LiveInterviewSession` outside `STOPPED` → no agent query needed. All three sessions ended today were stopped via the app's stop flow (V); the 09:17 agent was confirmed `STOPPED` by Agora earlier today.

## 8. Quality checks (run now)

| Check | Result | |
|---|---|---|
| `tsc --noEmit` | PASS (exit 0) | V |
| `npm run lint` | PASS — no warnings/errors (Next ESLint plugin not detected, warning only) | V |
| Focused tests (no DB env): live-orchestration 18, live-echo-guard 14, agora-route-authorization 21, agora-convoai-auth 6, agora-start-agent-config 3, agora-channel 5 | **67 passed, 0 failed, 0 skipped** (6 files) | V |
| Full suite / build | Not run (per audit rules) | NC |

## 9. Risks and blockers for a live phone test tomorrow (most severe first)

1. **3401 runs a stale build** — the 7-answer plan (resume, GitHub/LinkedIn, confirmation-email closing) and near-repeat fix are not live; a test now would exercise old behaviour (V).
2. **Quick Tunnel/process fragility** — tunnel, 3401 and Docker containers do not survive sleep/reboot; a new tunnel URL forces a rebuild (URL is baked in) (V/I).
3. **Low memory (18% free)** — a background server shell was already reaped once today; builds can be killed (V).
4. **~250 uncommitted files on `master`** — a single bad `git` command or disk issue loses Phase 2A–2E and all live fixes (V).
5. **Test-suite workers drain shared rows** — email outbox and assessment queue tests process any row in `ecopanel_test`, including live-test rows; must be protected manually before every full run (V).
6. **Closing promises an email that is never sent** — email provider unconfigured; candidate expectation mismatch (I).
7. **Question phrasing** — throwaway job description yields "Live, Test, Engineer" focus text; `experienceLevel` hardcoded "Mid" (V/I).
8. **Agora Console greeting / autonomous replies** — pre-empted by EchoPanel speech/interrupts but may be briefly audible (I).
9. `.env.local` lacks `APP_DATA_MODE` and points `DATABASE_URL` at `ecopanel_dev`: launching 3401 without the explicit overrides would run demo mode or hit the dev DB (V).

## 10. Recommendation for tomorrow

| # | Task | Est. |
|---|---|---|
| 1 | Check Docker/tunnel/3401; if tunnel URL changed get the new one; rebuild `.next-live` with the 18:10 orchestrator and restart only 3401 (explicit `APP_DATA_MODE`/`DATABASE_URL` overrides); verify markers + readiness | 20 min |
| 2 | One live phone test (headphones): 7 answers → resume Q after #2, GitHub/LinkedIn Q after #4, confirmation-email closing after #7, silence afterwards; verify transcript in DB | 25 min |
| 3 | Secure the work: review the diff, remove stray root artifacts (with approval), commit to a feature branch (not `master`) | 45 min |
| 4 | Scope test workers to their own rows (outbox + assessment queue) so full-suite runs stop touching live-test data; move the question bank out of `orchestrator.ts` (<500 lines) | 1.5 h |
| 5 | Decide the post-interview path: configure Resend sandbox (or reword the closing), add `assessment:worker` script + `.env.example` entries, pass real experience level/JD into the live interview | 1–2 h |
