# Backend Integration Plan

This document defines how the Phase 1 frontend should be connected to production services without changing its product behavior or exposing demo data as real.

> **Phase 2D status:** the persistent recruitment slice is implemented for jobs, applications, private CV storage, ClamAV scanning, HR applicant review, notes, stages, downloads, interviews, email, and Google Calendar synchronization. Phase 2D adds organization-scoped OAuth with PKCE and one-time state, AES-256-GCM token storage/rotation, a durable `calendar:worker`, deterministic/idempotent event create/update/cancel, explicit attendee notification policy, timezone/DST-safe scheduling, and visible sync status/retry. Phase 2C adds a Resend adapter, transactional email outbox, durable `email:worker`, signed delivery webhooks, lifecycle/retry handling, and explicit hiring notifications. Phase 2A.3 adds a durable scan-job worker, PostgreSQL-backed shared rate limiting that fails closed, health/readiness probes, structured redacted logging, and GitHub Actions CI. Live Resend delivery, live Google Calendar authorization/events, transcripts, and real assessment generation remain unverified or unimplemented, and the UI states those limits. See `docs/CURRENT_STATUS_AUDIT.md` for verified behavior and remaining gaps.

## Phase 1 Baseline (Superseded for the Recruitment Slice)

- All recruitment data lives in `lib/demo-data.ts` and is created per browser session by `components/DemoDataProvider.tsx`.
- UI code consumes typed domain objects from `lib/domain.ts` and pure helpers from `lib/demo-service.ts`.
- New applications, stage changes, notes, jobs, interviews, email activity, template edits, and mail settings are held in React memory only.
- CV files are never stored or uploaded. Only local filename and size metadata are read in the browser.
- Email is never delivered. "Sent" means a simulated activity record; seeded pending/failed records are fictional examples.
- No authentication is implemented. `/hr/login` is a demo entry point and must not be treated as authorization.
- Existing EchoPanel interview/Agora functionality remains separate and intact.

## Integration Principles

1. Preserve the current domain names and UI contracts while replacing the data source behind them.
2. Keep server-only secrets, storage credentials, provider keys, and signing logic out of the client bundle.
3. Do not silently change simulated records into real delivery or AI claims.
4. Treat candidate data, CVs, notes, and interview evidence as sensitive.
5. Make every mutation authoritative on the server, auditable, and tenant-scoped.
6. Keep the demo adapter available for local demos and visual testing behind an explicit configuration flag.

## Recommended Layers

```text
Pages/components
  -> shared state or server queries
  -> domain service interfaces
  -> HTTP adapter (Phase 2)
  -> API route handlers / backend service
  -> database + object storage + providers
```

Suggested modules:

- `lib/domain.ts`: unchanged domain types, expanded with server IDs and timestamps where needed.
- `lib/services/recruitment.ts`: browser-facing interface for applications, jobs, notes, interviews, and mail.
- `lib/services/demo-recruitment.ts`: current in-memory behavior extracted behind that interface.
- `lib/services/http-recruitment.ts`: fetch-based implementation for Phase 2.
- `lib/server/*`: server-only repositories, auth, storage, and provider adapters. Never import into client components.

Prefer server components for initial page reads and route handlers/server actions for mutations. If the current `DemoDataProvider` remains, it should become the demo implementation of the same interface rather than the production source of truth.

## Data Model

Use opaque UUID/ULID identifiers and UTC timestamps. Suggested relational shape:

### `organizations`

- `id`, `name`, `slug`, `created_at`, `updated_at`

### `jobs`

- `id`, `organization_id`, `title`, `department`, `location`, `workplace`, `employment_type`
- `salary_range`, `summary`, `description`, `responsibilities` (JSON array), `qualifications` (JSON array)
- `status` (`Draft`, `Published`, `Closed`), `public_visible`, `published_at`
- `created_at`, `updated_at`

### `candidates`

- `id`, `organization_id`, `name`, `email`, `phone`, `location`, `headline`
- `linkedin_url`, `github_url`, `portfolio_url`
- `created_at`, `updated_at`
- Unique normalized email per organization for deduplication; do not merge records silently without review.

### `applications`

- `id`, `organization_id`, `job_id`, `candidate_id`
- `stage` (`New`, `In Review`, `Shortlisted`, `Interview`, `Selected`, `Rejected`)
- `source`, `applied_at`, `updated_at`
- `cover_letter`
- `cv_file_id`
- `consent_version`, `consented_at`
- Unique `(job_id, candidate_id)` unless reapplication is explicitly supported.

### `cv_files`

- `id`, `organization_id`, `candidate_id`
- `storage_key`, `original_filename`, `mime_type`, `size_bytes`, `checksum`
- `scan_status`, `uploaded_at`, `deleted_at`

Store files in private object storage. Keep only metadata in the application row.

### `application_notes`

- `id`, `application_id`, `author_user_id`, `body`, `created_at`, `updated_at`
- Notes are internal-only. Never expose them on public routes or candidate-facing APIs.

### `application_events`

- `id`, `application_id`, `actor_user_id`, `type`, `label`, `detail`, `metadata`, `created_at`
- Append-only activity log for stage changes, notes, interviews, and email actions.

### `interviews`

- `id`, `application_id`, `job_id`, `candidate_id`
- `round`, `status` (`Scheduled`, `Completed`, `Cancelled`)
- `scheduled_at`, `duration_minutes`, `timezone`, `notes`
- `calendar_event_id`, `assessment_id`, `created_at`, `updated_at`

### `assessments` and `assessment_dimensions`

- Assessment: `id`, `application_id`, `interview_id`, `overall_score`, `recommendation`, `summary`, `generated_at`, `source`
- Dimensions: `id`, `assessment_id`, `key`, `label`, `score`, `confidence`, `evidence` (JSON), `source_turns` (JSON)
- `source` must distinguish seeded/demo content from real generated assessments.
- Evidence must reference persisted transcript turns and must not be synthesized after the fact.

### `email_templates`

- `id`, `organization_id`, `name`, `category`, `description`, `subject`, `body`, `updated_by`, `updated_at`
- Preserve placeholder validation server-side against an allowlist.

### `email_messages`

- `id`, `organization_id`, `candidate_id`, `application_id`, `job_id`
- `template_id`, `recipient_name`, `recipient_email`, `subject`, `body`
- `status` (`Draft`, `Queued`, `Sending`, `Sent`, `Delivered`, `Bounced`, `Complained`, `Failed`, `Cancelled`; legacy `Pending` migrates to `Queued`)
- `provider_name`, `provider_mode`, `provider_message_id`, `failure_code`, `last_error`, `attempts`, `max_attempts`, `available_at`, lease fields, accepted/delivered/bounced/complained/failed/cancelled timestamps.
- `attachments` metadata only; binaries belong in private storage.
- `EmailDeliveryEvent` stores provider event ids uniquely with type, occurred/received time, and metadata. Delivery, bounce, and complaint events are separate; provider acceptance is not treated as delivery.

### `mail_settings`

- `organization_id`, `sender_name`, `sender_address`, `reply_to`, `signature`
- Provider credentials belong in a secrets manager, never this table or the client.

## Public API Surface

### Careers

- `GET /api/public/jobs`: published, publicly visible jobs only. Support search, department, workplace, employment type, pagination, and stable ordering.
- `GET /api/public/jobs/:id`: published job detail. Return 404 for drafts/closed roles unless explicitly allowed.
- `POST /api/public/applications`: multipart form with job ID, candidate details, cover letter, consent, and CV.
  - Validate MIME type and size server-side. Do not trust client filename or content type.
  - Generate a server-side storage key. Never use a user filename as a path.
  - Scan files before enabling recruiter download.
  - Validate the job is published and accepting applications.
  - Use an idempotency key to prevent duplicate submissions on retries.
  - Return a non-guessable application reference. Public confirmation must not expose internal notes or assessment data.
- `GET /api/public/applications/:id`: minimal confirmation data only, protected by a signed/opaque token or candidate session.

### Recruiter

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- Replace demo login with a real identity provider or secure session implementation.
- Require organization membership and RBAC on every endpoint.
- `GET /api/hr/applicants`: cursor pagination, server-side filters, stable sorting, counts.
- `GET /api/hr/applicants/:id`: candidate, application, CV metadata, notes, events, interviews.
- `PATCH /api/hr/applications/:id/stage`: optimistic concurrency via `updated_at`/version.
- `POST /api/hr/applications/:id/notes`
- `POST /api/hr/applications/bulk-stage`: cap batch size, validate every application belongs to the organization, return per-item results.
- `GET/POST /api/hr/jobs`, `GET/PATCH /api/hr/jobs/:id`, `PATCH /api/hr/jobs/:id/status` (publish/close/draft)
- `GET/POST /api/hr/interviews`, `GET/PATCH /api/hr/interviews/:id`, `GET /api/hr/interviews/options`
- `POST /api/hr/interviews/:id/cancel`, `POST /api/hr/interviews/:id/complete`
- `GET/POST /api/hr/interviews/:id/assessment` (complete interview required; no generator)
- `GET/POST /api/hr/email/messages`, `GET /api/hr/email/messages/:id`
- `GET/POST /api/hr/email/templates`, `GET/PATCH /api/hr/email/templates/:id`
- `GET/PATCH /api/hr/email/settings`
- `GET/DELETE /api/hr/calendar/connection`, `POST /api/hr/calendar/connect`, `GET /api/hr/calendar/google/callback`, `POST /api/hr/calendar/events/:id/retry`

All implemented HR routes require a session, enforce organization scope, and apply `hrRead` or `hrMutation` rate limits. Mutations require `canManageApplications`.

### Auth and Security Requirements

- HttpOnly, Secure, SameSite cookies; rotate sessions after login.
- CSRF protection for state-changing requests.
- Rate limits on login, application submission, and email actions.
- Server-side authorization by organization and role, not client route guards.
- Audit actor, timestamp, IP/user-agent where appropriate, and before/after values for sensitive changes.
- Encrypt transport and storage. Define retention and deletion policies for CVs and candidate data.
- Validate and sanitize rich content. Avoid rendering untrusted HTML; continue using plain text or a tightly controlled renderer.
- Malware scanning, fail-closed download policy, checksum verification, and content-disposition protections are implemented for CV downloads. Keep them enabled and monitor scan failures.
- Never place provider keys, storage secrets, or service credentials in `NEXT_PUBLIC_*` variables.

## CV Upload Flow

1. Candidate selects a PDF/DOC/DOCX under the server-enforced limit.
2. Client validates extension/MIME as a UX convenience only.
3. `POST /api/public/applications` authenticates to storage server-side, generates an opaque key, writes the file, and records metadata.
4. The application transaction enqueues a durable scan job; a separate worker scans the object. Files are `PENDING` until a durable scan verdict arrives; unavailable or failed scans become `SCAN_FAILED` and are retried with bounded backoff.
5. Recruiter download is available only for `CLEAN` files and only after organization authorization, integrity verification, and download-policy checks.
6. Replacing a CV deletes or versions the old object according to retention policy.
7. The UI must not claim upload success until server confirmation. It must not claim encryption unless the storage/service actually provides it.

## Email Delivery Flow

1. Compose or a hiring workflow persists a `Draft` or inserts `Queued` messages into the transactional outbox.
2. Server validates recipient organization scope, template placeholders, permissions, and rate limits. Hiring notifications share the business transaction.
3. A separate `email:worker` claims due `Queued` rows with `FOR UPDATE SKIP LOCKED`, sets a lease, and calls the provider adapter with a stable idempotency key.
4. Provider acceptance sets `Sent`; definite transient failures requeue with bounded backoff; permanent failures become `Failed`; ambiguous outcomes become `Failed` with `AMBIGUOUS_SEND` and are not retried automatically.
5. Delivery/bounce/complaint states arrive through a signature-verified webhook. Duplicate and older events cannot regress newer state. "Sent" never implies "Delivered".
6. Expired sending leases are recovered as ambiguous. Non-ambiguous failures can be manually requeued with an audit event.
7. Attachments are uploaded separately, scanned, and attached by server-side storage reference.
8. Failures expose safe user-facing reasons. Do not fabricate provider errors in demo mode.
9. Unsubscribe/consent requirements depend on jurisdiction and message type; implement before real sends.

Provider adapter interface:

```ts
interface EmailProvider {
  name: string;
  mode: "live" | "test";
  send(input: EmailSendRequest): Promise<
    | { outcome: "accepted"; providerMessageId: string }
    | { outcome: "retryable"; code: string; message: string; retryAfterMs?: number }
    | { outcome: "permanent"; code: string; message: string }
    | { outcome: "ambiguous"; code: string; message: string }
  >;
}
```

## Calendar Integration

- **Done:** the database remains the scheduling source of truth. `CalendarEvent` is a durable outbox keyed by interview/provider, and the latest sync state is exposed separately from the interview record.
- **Done:** Google OAuth is server-side with PKCE S256, a one-time 10-minute state bound to user/organization/session, and encrypted access/refresh tokens. Tokens are encrypted with AES-256-GCM and organization/provider AAD; `CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS` supports rotation, and refresh re-encrypts both tokens with the current key.
- **Done:** `calendar:worker` creates/updates/cancels events with leases, version guards, interrupted-lease recovery, bounded exponential backoff, and deterministic base32hex-safe event IDs. Google `409` resolves by fetching the existing event; missing events on cancel are idempotent.
- **Done:** sync failures are explicit (`Pending`, `Retrying`, `Skipped`, `Failed`, `Succeeded`) and the UI never presents an interview as calendar-invited until the worker records success. Failed/skipped work can be retried manually.
- **Done:** email and Google Calendar attendee notification are separate explicit options. Calendar uses `sendUpdates=none|all`; the UI marks the request, not delivery. Worker success confirms Google accepted the event change, not that an attendee email was delivered.
- **Done:** UTC is stored plus the IANA display timezone captured at scheduling. Wall-clock conversion rejects DST gaps instead of relying on browser-local parsing.
- **Outstanding:** live Google OAuth client/redirect/account verification, account-replacement cleanup for events left in an old calendar, staged production key rotation, and supervised worker/metrics/runbook operations.

## Migration Sequence

1. Add database schema, organization scoping, auth, and seed/migration scripts.
2. Define service interfaces matching current UI needs.
3. Implement read-only server endpoints for jobs and applicants.
4. Replace reads in careers pages, then pipeline/dashboard.
5. **Done:** transactional mutations for applications, stages, notes, jobs, interviews, and email records.
6. **Done:** private CV storage and scanning.
7. **Done:** interview persistence and report linkage. Completing an interview does not generate an assessment; the report is honest when none exists. A real generation pipeline is still outstanding.
8. **Done:** email drafts, durable queues, templates, settings, Resend adapter, worker, webhooks, retries, bounce/complaint handling, and explicit hiring notifications. **Done:** Google Calendar OAuth/token encryption, durable calendar worker, idempotent create/update/cancel, notification policy, timezone/DST handling, and sync status/retry. **Outstanding:** verified live Resend and Google credentials, supervised production workers, account-replacement cleanup, and staged key rotation.
9. **Done:** demo mode is explicit; database mode never substitutes demo records.
10. **Partially done:** shared rate limits, health probes, redacted logs, request IDs, CI, and a durable scan worker exist. Retention jobs, backup/restore tests, centralized logs, alerting, and audit review remain outstanding.

Do not switch all screens at once. Preserve feature flags so the visual demo remains usable while backend slices are validated.

## Testing and Acceptance

- Unit-test pure filtering, template rendering, score display, and stage transitions.
- Integration-test organization isolation and RBAC for every endpoint.
- Test duplicate application idempotency and concurrent stage updates.
- Test malicious filenames, oversized files, MIME mismatches, and infected files.
- Test email send retries, webhook verification, and provider failure handling.
- **Done:** test timezone/DST behavior, calendar create/update/cancel/retry, token encryption/rotation, and OAuth state with fake providers.
- Test that public endpoints never expose notes, assessments, other candidates, or draft jobs.
- Add accessibility and responsive checks for the current pages.
- Add error-boundary and empty/loading states for server failures; do not replace real failures with demo data.

## Open Questions

- Identity provider and invitation flow for recruiters.
- Multi-organization tenancy from day one or single-tenant initially.
- Reapplication policy and candidate account model.
- Data retention schedule by jurisdiction and candidate request workflow.
- Whether assessment generation remains separate from recruitment storage.
- Which email/calendar providers are approved and what consent language is required.
- SLA and notification behavior for failed CV scans or calendar sync.

## Out of Scope for Phase 1

- Real auth, authorization, database persistence, or server APIs
- Real CV upload/storage or malware scanning
- Real email delivery, tracking, or provider credentials
- Real calendar invitations or candidate notifications
- Real AI interview evaluation generation or claims
- Recruiter mobile app, analytics warehouse, or billing
