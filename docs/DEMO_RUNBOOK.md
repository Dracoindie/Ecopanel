# Demo runbook

The live demo runs on this laptop: the `next start` server on `127.0.0.1:3401` (database `ecopanel_test`), Postgres and ClamAV in Docker, and a permanent public URL from Tailscale Funnel:

**https://echopanel.taild1975d.ts.net** → `127.0.0.1:3401`

`APP_PUBLIC_URL` and `NEXT_PUBLIC_APP_URL` in `.env.live.local` point there. The URL does not change, so candidate links in emails stay valid across restarts.

## Desktop shortcuts

| Shortcut | Script | What it does |
|---|---|---|
| **EchoPanel Start** | `scripts/demo-up.ps1` | Starts Docker Desktop if needed, waits for our Postgres and ClamAV containers to be healthy, turns the funnel on for 3401 if it is off, starts 3401 with `start-live.ps1` unless it is already running, then runs the check. Safe to run twice: it never starts a second server, container or funnel. |
| **EchoPanel Check** | `scripts/demo-check.ps1` | Read-only. Prints a PASS/FAIL table and ends with `READY` or `NOT READY: <reason>`. |
| **EchoPanel Stop** | `scripts/demo-down.ps1` | Stops the 3401 server only. Containers and the funnel keep running. |

Each opens a PowerShell window that stays open. Close it when you have read the result. From a terminal: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo-up.ps1` (and the same for the others).

Timings measured on 2026-10-29: about 15 s with Docker already up, and about 10 s when everything is already running. After a cold boot, add about a minute for Docker Desktop and up to 3 minutes for ClamAV to load its signatures.

**Before the presentation:** click **EchoPanel Start** and wait for `READY`.

## What the check covers

Docker running · Postgres healthy and reachable as `ecopanel_test` (on the port in `DATABASE_URL`) · ClamAV container healthy and the app's scanner check ok · 3401 `/api/health/ready` · which build is served (`.next-live` or the `.next-live-h9v` rollback) · funnel on, proxying 3401, and matching `APP_PUBLIC_URL` · public `/api/health/live` returns 200 · env keys present (Agora, Resend, Groq; names only) · `EMAIL_MODE=test` · no Agora session left `RUNNING` · no queued or sending emails · no pending assessment, CV-scan or calendar jobs.

No secret is printed. Env values are only tested for presence. The exceptions are `EMAIL_MODE` and the Groq model name, which are not secret.

## If the result is NOT READY

Run **EchoPanel Start** once more first. Most failures right after boot are just slow starts. Then:

| Failing row | What to do |
|---|---|
| Docker running | Open Docker Desktop and wait for "Engine running", then Start again. |
| Postgres / ClamAV | `docker ps -a`. If a container is missing, recreate it: `docker compose -f compose.phase2a.yml --env-file <env with POSTGRES_USER/POSTGRES_PASSWORD> up -d`. ClamAV can take about 3 minutes after Docker starts, so wait and check again. Never touch the `amx_*` containers. |
| 3401 readiness | Read `scratchpad/server-3401.log`. If 3401 is stuck, click Stop, then Start. If `start-live.ps1` says `REFUSED`, the message names the bad setting. |
| Build served | Stop, then Start. To fall back to the known-good build: `scripts/start-live.ps1 -Rollback`. |
| Tailscale funnel | Make sure Tailscale is running and logged in (tray icon), then Start again (it runs `tailscale funnel --bg 3401`). If it says the URL does not match, `APP_PUBLIC_URL` in `.env.live.local` is not the funnel URL. |
| Public /api/health/live | The funnel row passes but the public URL fails: check internet access, run `tailscale funnel status`, and wait a minute (DNS). If it stays down, use the cloudflared fallback below. |
| Env rows | The named key is missing from `.env.live.local`. Add it there; never commit or print it. |
| No Agora session RUNNING | A live interview did not end cleanly. Ending it from the interview page stops the agent; otherwise it expires on its own (`expiresAt`). Ask before changing rows by hand. |
| No queued emails / No pending jobs | Something is waiting for a worker. The detail lists the ids. Either it is expected (send or run it on purpose, one at a time, e.g. `npm run email:send-one -- <id>`, `npm run assessment:run-one -- <id>`), or decide explicitly to cancel it. Do not start a long-running worker: it would process every leftover, including real emails and Groq calls. |

## Emergency fallback: cloudflared quick tunnel

Use this only if Tailscale Funnel is unavailable. Quick-tunnel URLs change on every start, and links already emailed will stop working.

1. `cloudflared tunnel --url http://127.0.0.1:3401` in its own window; keep it open. It prints a `https://<words>.trycloudflare.com` URL.
2. Set `APP_PUBLIC_URL` and `NEXT_PUBLIC_APP_URL` in `.env.live.local` to that URL. No rebuild is needed.
3. **EchoPanel Stop**, then **EchoPanel Start**.
4. The check will show `FAIL` on "Tailscale funnel" (the URL no longer matches the funnel). That row is expected while on the fallback; every other row must pass. Confirm `<url>/api/health/live` returns 200.
5. Afterwards, set both keys back to `https://echopanel.taild1975d.ts.net` and Stop, then Start.

Quick tunnels can drop. Keep the cloudflared window open and the laptop awake during an interview.

## After the presentation: turn the funnel off

The funnel makes 3401 reachable from the internet. Turn it off when the demo is over:

```powershell
tailscale funnel reset     # removes the funnel (and any serve config) on this laptop
tailscale funnel status    # should report no funnel
```

Then click **EchoPanel Stop**. The containers can keep running; `docker stop ecopanel-phase2a-postgres-1 ecopanel-phase2a-clamav-1` stops them too. They restart automatically with Docker (`restart: unless-stopped`) unless stopped this way.

Next time, **EchoPanel Start** turns the funnel back on with the same URL.
