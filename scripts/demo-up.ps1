<#
.SYNOPSIS
  Brings the demo up end to end, then runs scripts/demo-check.ps1.

.DESCRIPTION
  1. Starts Docker Desktop if the daemon is not reachable.
  2. Starts our Postgres and ClamAV containers if stopped and waits until healthy
     (never touches any other container).
  3. Turns the Tailscale funnel on for 3401 if it is not already.
  4. Starts the 3401 server with scripts/start-live.ps1 unless something already
     listens on 3401, then waits for /api/health/ready.
  5. Runs scripts/demo-check.ps1 and exits with its code (0 = READY).

  Safe to run repeatedly: every step is skipped when already done, so it never
  starts a second server, container or funnel. Never prints a secret.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo-up.ps1
#>
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Port = 3401
$Containers = @("ecopanel-phase2a-postgres-1", "ecopanel-phase2a-clamav-1")
$DockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$clock = [Diagnostics.Stopwatch]::StartNew()

function Step([string]$Message) { Write-Host ("[{0,4}s] {1}" -f [int]$clock.Elapsed.TotalSeconds, $Message) }
function Test-Docker { docker info --format "{{.ServerVersion}}" *> $null; return $LASTEXITCODE -eq 0 }
function Get-Health([string]$Name) {
  $health = docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $Name 2>$null
  return "$health".Trim()
}
function Test-Ready {
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$Port/api/health/ready").StatusCode -eq 200 } catch { return $false }
}

# 1. Docker Desktop
if (Test-Docker) {
  Step "Docker already running."
} else {
  Step "Starting Docker Desktop ..."
  if (-not (Test-Path $DockerDesktop)) { Step "Docker Desktop not found at $DockerDesktop." }
  else { Start-Process -FilePath $DockerDesktop | Out-Null }
  $deadline = (Get-Date).AddMinutes(3)
  while (-not (Test-Docker) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3 }
  if (Test-Docker) { Step "Docker is up." } else { Step "Docker did not start within 3 minutes." }
}

# 2. Our containers only (restart policy unless-stopped normally brings them back by itself).
if (Test-Docker) {
  foreach ($name in $Containers) {
    $state = "$(docker inspect -f '{{.State.Status}}' $name 2>$null)".Trim()
    if (-not $state) { Step "Container $name does not exist; create it with: docker compose -f compose.phase2a.yml --env-file <env> up -d" }
    elseif ($state -ne "running") { Step "Starting $name ($state) ..."; docker start $name *> $null }
  }
  # ClamAV loads its signature database on start and can need ~3 minutes.
  $deadline = (Get-Date).AddMinutes(5)
  do {
    $pending = @($Containers | Where-Object { (Get-Health $_) -ne "healthy" })
    if ($pending.Count -eq 0) { break }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)
  if ($pending.Count -eq 0) { Step "Postgres and ClamAV are healthy." }
  else { Step "Still not healthy after 5 minutes: $($pending -join ', ')." }
}

# 3. Tailscale funnel for 3401
$tailscale = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $tailscale) { $tailscale = "C:\Program Files\Tailscale\tailscale.exe" }
if (-not (Test-Path $tailscale)) {
  Step "Tailscale is not installed; skipping the funnel."
} else {
  $status = & $tailscale funnel status 2>&1 | Out-String
  if ($status -match "\(Funnel on\)" -and $status -match "proxy http://127\.0\.0\.1:$Port") {
    Step "Funnel already on for $Port."
  } else {
    Step "Turning the funnel on for $Port ..."
    & $tailscale funnel --bg $Port *> $null
    $status = & $tailscale funnel status 2>&1 | Out-String
    if ($status -match "\(Funnel on\)") { Step "Funnel is on." } else { Step "Funnel did not turn on (is Tailscale logged in?)." }
  }
}

# 4. The 3401 server: never start a second one.
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Step "3401 already running (pid $($listener.OwningProcess)); not starting another."
} else {
  Step "Starting 3401 with start-live.ps1 ..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-live.ps1")
  if ($LASTEXITCODE -ne 0) { Step "start-live.ps1 refused or failed (see above)." }
}
$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Ready) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }

# 5. Verdict
Step "Running demo-check.ps1 ..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "demo-check.ps1")
$code = $LASTEXITCODE
Write-Host ("demo-up finished in {0}s." -f [int]$clock.Elapsed.TotalSeconds)
exit $code
