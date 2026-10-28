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
| 11 | HR reviews report; candidate notified | `app/hr/(portal)/interviews/[id]/report`; `api/hr/interviews/[id]/{assessment,assessment/review,assessment/retry,transcript}` | Assessment, EmailMessage | PARTIAL | Report/review routes exist (I); no AI content without provider; closing line now says the hiring team "will be in touch" (no email promise) (V) |

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
| Latest orchestrator in build? | **NO.** `lib/orchestrator.ts` changed 18:10; build lacks resume, GitHub/LinkedIn, plan closing and near-repeat fix (has older closing + repeat guard). *Superseded by the rebuild after the "Start live server" changes.* | V |
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

1. **3401 runs a stale build** — the 7-answer plan (resume, GitHub/LinkedIn, closing) and near-repeat fix are not live; a test now would exercise old behaviour (V).
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
| 2 | One live phone test (headphones): 7 answers → resume Q after #2, GitHub/LinkedIn Q after #4, neutral closing after #7, silence afterwards; verify transcript in DB | 25 min |
| 3 | Secure the work: review the diff, remove stray root artifacts (with approval), commit to a feature branch (not `master`) | 45 min |
| 4 | Scope test workers to their own rows (outbox + assessment queue) so full-suite runs stop touching live-test data; move the question bank out of `orchestrator.ts` (<500 lines) | 1.5 h |
| 5 | Decide the post-interview path: configure Resend sandbox (or reword the closing), add `assessment:worker` script + `.env.example` entries, pass real experience level/JD into the live interview | 1–2 h |

## Start live server (port 3401)

`scripts/start-live.ps1` is the only supported way to start the isolated live-acceptance server. It never touches port 3400 and never prints a value.

**One-time setup:** `.env.live.local` (git-ignored, repo root) holds `APP_DATA_MODE=database`, `DATABASE_URL` (ecopanel_test), `APP_PUBLIC_URL` and `NEXT_PUBLIC_APP_URL` (public https tunnel), `AUTH_SECRET`, `CV_STORAGE_DIR`, `CV_SCANNER_PROVIDER=clamav`, `CV_CLAMAV_HOST=127.0.0.1`, `CV_CLAMAV_PORT=3310` and the `AGORA_*` values. Never commit or print it.

**Start (existing build):** stop the old 3401 process first, then
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-live.ps1`

**Rebuild and start (after code changes):** add `-Build` (writes `scratchpad/build-live.log`; needs about 4 GB free RAM).

**New tunnel URL:** update `APP_PUBLIC_URL` in `.env.live.local` and restart. No rebuild is needed: the server reads `APP_PUBLIC_URL` at runtime and it overrides the build-time `NEXT_PUBLIC_APP_URL` for candidate links, auth base URL and the calendar callback.

**The script refuses to start** (exit 1, `REFUSED: …`) when the env file is missing, `APP_DATA_MODE` is not `database`, the database is not `ecopanel_test`, `APP_PUBLIC_URL` is not https, `scripts/assert-safe-db.mjs` rejects the URL (non-local host or non-test name), `.next-live` has no build, or port 3401 is already in use. All refusal paths were exercised with throwaway env files.

**Logs:** `scratchpad/server-3401.log` (git-ignored). The server keeps running after the launching shell exits.

## Full journey test — 2026-10-28, build `rgMVR2na7pnazJR-OaUyx` (3401)

Recruiter on laptop, candidate on phone, via the Cloudflare tunnel; `ecopanel_test`, org `journey-test`. No email worker, no assessment worker, no OpenAI; one Agora session.

| # | Step | Result | Evidence |
|---|---|---|---|
| 0 | Recruiter login (bootstrap script, password typed by the user, never logged) | Verified | OWNER membership + credential hash; HR session 14:19 UTC |
| 1 | Create + publish job | Verified | "Senior Frontend Engineer" `Published`, publicVisible; only job in public careers API |
| 2 | Apply with CV (phone) | Verified (links untested) | Candidate/Application/CvFile same org; PDF 4.3 KB, checksum; LinkedIn/GitHub left blank by the tester |
| 3 | CV scan | Verified CLEAN | One scoped pass (`scratchpad/scan-one-cv.ts`), local ClamAV only; job SUCCEEDED; no backfill/cleanup |
| 4 | Review + shortlist | Verified | Stage `Shortlisted`, events logged; CV opened (tester-confirmed only) |
| 5 | Schedule + one-time link | Verified | Interview `Scheduled`; 1 invitation (72 h); `interview-link` email Queued, placeholder only |
| 6 | Redeem link (phone) | Verified | redeemedAt 15:02:05; candidate session 2 h; join event |
| 7 | Live AI interview | Verified | 7 answers → 7 new questions (9/9 distinct); resume after #2, GitHub/LinkedIn after #4, one neutral closing after #7; silence after |
| 8 | End interview | Verified | Live session STOPPED, candidate session revoked, interview Completed, 1 transcript (17 turns), 1 assessment job Pending; link reuse → "expired" (DB: 1 session only) |
| 9 | HR view + isolation | Verified | Transcript visible in HR; candidate cookie → 401 on every HR route (live HTTP check); no report link because no assessment exists (by design) |

**Felt wrong (follow-ups):**
1. Opening says "As a **Senior Senior** Frontend Engineer" — derived level is prefixed to a title that already contains it (bug from the experience-level change).
2. Answers split into fragments (turns 2–4 s after a question) count as full answers, so the 7-answer plan finished in ~2.5 min. Consider merging quick consecutive candidate turns or a longer end-of-speech silence.
3. Job-keyword phrasing reads awkwardly ("that work on product, frontend").
4. Four candidate emails queued by one journey (received, shortlisted, interview-invite, interview-link); none sent. Decide which are wanted.
5. Interview could be scheduled in the past (12:35 UTC, accepted at ~14:58 UTC); timezone defaulted to Asia/Singapore.
6. Re-applying with the same email does not update an existing candidate's links.
7. No report without an assessment provider; the HR UI gives no hint why the report is missing.

Test artefacts: org `journey-test` (1 job, 1 application, 1 interview, 4 queued emails, 1 pending assessment job); one throwaway isolation org with 1 redeemed invitation and 1 queued email.

## Fixes after the journey test (branch `mvp/live-acceptance`)

| Follow-up | Fix | Tests |
|---|---|---|
| 1. "Senior Senior" | `roleWithLevel()` adds the level only when the title has none; used by the opening question and the agent prompt | `live-orchestration`: Senior/Junior/Lead/Staff titles, opening text |
| 2. Fragmented answers, 2.5-min interview | **Root cause (V, transcript timing):** turns 5 and 13 finalized 2.4 s and 3.6 s after a question that takes ~7–8 s to speak, so they were continuations of the previous answer cut at the 480 ms end-of-turn threshold; each advanced the plan. **Fix:** end-of-turn silence 480→900 ms, and the client merges finalized segments into one answer until the candidate has been quiet for 1.5 s (interim speech resets the wait). A minimum answer length was rejected because turn 7 (4 words) was a genuine answer. Plan is now 8 answers (resume after #2, GitHub/LinkedIn after #5, closing after #8) | `live-flow-regression` accumulator replay of the 15:04 timing; `live-orchestration` 8-answer length for plain/technical/business/short answers (pool never exhausted early) |
| 3. "that work on product, frontend" | Follow-ups say "that work"; the opening uses `jobFocusPhrase()` (technical areas in plain words, e.g. "React and frontend development") or a plain sentence | `live-orchestration` wording tests |
| 5. Past interview times, Singapore default | Server rejects times more than 60 s in the past (`INTERVIEW_IN_PAST`, message shown in the dialog); database-mode scheduling defaults to `Asia/Kolkata` | `hr-assessment-dimensions`: create + reschedule rejection |
| 7. No report, no explanation | Report page shows "Assessment provider not configured", "Assessment pending" or "Assessment failed: <safe reason>" (fixed text per failure code, never raw errors); interview page always shows a "Report status" link | `assessment-status` |

Also: three DB tests used dates in early Nov 2026 (would start failing after those dates) — moved to 2027; `scratchpad/` excluded from typecheck; the isolation-check candidate session was revoked (no other test data changed).
Still open from the journey list: #4 (four queued emails per journey), #6 (re-applying does not update links).
