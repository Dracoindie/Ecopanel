<#
.SYNOPSIS
  Read-only demo readiness check: prints a PASS/FAIL table, then READY or NOT READY.

.DESCRIPTION
  Checks Docker, the Postgres and ClamAV containers, the 3401 server (readiness and
  which build it serves), the cv/email/assessment workers (exactly one of each),
  the Tailscale funnel, the public URL, the env keys the demo
  needs (names only), and that no Agora session, queued email or pending job is left
  over. Changes nothing. Never prints a secret: env values are only tested for
  presence, except EMAIL_MODE / provider names, which are not secret.

  Exit code 0 when READY, 1 when NOT READY.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo-check.ps1
#>
param([string]$EnvFile = "")

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Port = 3401
$PgContainer = "ecopanel-phase2a-postgres-1"
$ClamContainer = "ecopanel-phase2a-clamav-1"
$results = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$Name, [bool]$Pass, [string]$Detail) {
  $results.Add([pscustomobject]@{ Check = $Name; Pass = $Pass; Detail = $Detail })
}

function Get-Http([string]$Uri, [int]$TimeoutSec = 10) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec $TimeoutSec -Uri $Uri
    return @{ Status = [int]$response.StatusCode; Body = $response.Content }
  } catch {
    $status = 0
    $body = ""
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try { $body = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch { }
    }
    return @{ Status = $status; Body = $body }
  }
}

function Get-ContainerHealth([string]$Name) {
  $health = docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $Name 2>$null
  if ($LASTEXITCODE -ne 0) { return "missing" }
  return "$health".Trim()
}

function Format-Ids([string]$Csv) {
  $ids = @($Csv -split "," | Where-Object { $_ })
  if ($ids.Count -le 3) { return ($ids -join ", ") }
  return (($ids[0..2] -join ", ") + " (+$($ids.Count - 3) more)")
}

# Env file: parsed into a local table only (never into this process, never printed).
if (-not $EnvFile) { $EnvFile = Join-Path $Root ".env.live.local" }
$envVars = @{}
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $envVars[$Matches[1]] = $Matches[2] -replace '^["'']|["'']$', '' }
  }
}
function Test-Keys([string[]]$Names) {
  $missing = @($Names | Where-Object { -not $envVars[$_] })
  if ($missing.Count -eq 0) { return @{ Pass = $true; Detail = ($Names -join ", ") } }
  return @{ Pass = $false; Detail = "missing: " + ($missing -join ", ") }
}

# 1. Docker
docker info --format "{{.ServerVersion}}" *> $null
$dockerUp = $LASTEXITCODE -eq 0
Add-Check "Docker running" $dockerUp $(if ($dockerUp) { "daemon reachable" } else { "Docker Desktop is not running" })

# 2. Postgres: container healthy, DATABASE_URL targets ecopanel_test on the container's port.
$dbName = $null
$dbPortOk = $false
try {
  $dbUri = [System.Uri]$envVars["DATABASE_URL"]
  $dbName = $dbUri.AbsolutePath.TrimStart("/")
  $published = if ($dockerUp) { "$(docker port $PgContainer 5432 2>$null)" } else { "" }
  $dbPortOk = $published -match ":$($dbUri.Port)\b"
} catch { }
$pgHealth = if ($dockerUp) { Get-ContainerHealth $PgContainer } else { "unknown" }
$dbRows = @{}
if ($pgHealth -eq "healthy" -and $dbName -eq "ecopanel_test" -and $dbPortOk) {
  # SQL goes in on stdin so no quoting passes through the command line.
  $sql = @'
SELECT 'db|' || current_database();
SELECT 'agora|' || coalesce(string_agg(id, ','), '') FROM "LiveInterviewSession" WHERE status = 'RUNNING';
SELECT 'email|' || coalesce(string_agg(id, ','), '') FROM "EmailMessage" WHERE status IN ('Queued', 'Sending');
SELECT 'assessment|' || coalesce(string_agg(id, ','), '') FROM "AssessmentJob" WHERE status IN ('Pending', 'Retrying', 'Processing');
SELECT 'cvscan|' || coalesce(string_agg(id, ','), '') FROM "CvScanJob" WHERE status IN ('PENDING', 'RETRY', 'RUNNING');
SELECT 'calendar|' || coalesce(string_agg(id, ','), '') FROM "CalendarEvent" WHERE status = 'Pending';
'@
  $output = $sql | docker exec -i $PgContainer sh -c 'psql -X -q -A -t -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d ecopanel_test' 2>$null
  if ($LASTEXITCODE -eq 0) {
    foreach ($row in @($output)) { if ("$row" -match '^(\w+)\|(.*)$') { $dbRows[$Matches[1]] = $Matches[2].Trim() } }
  }
}
$pgOk = $pgHealth -eq "healthy" -and $dbRows["db"] -eq "ecopanel_test"
$pgDetail = if ($pgOk) { "healthy, ecopanel_test reachable" }
  elseif ($pgHealth -ne "healthy") { "container $pgHealth" }
  elseif ($dbName -ne "ecopanel_test") { "DATABASE_URL does not target ecopanel_test" }
  elseif (-not $dbPortOk) { "DATABASE_URL port is not the container's port" }
  else { "query failed" }
Add-Check "Postgres + ecopanel_test" $pgOk $pgDetail

# 3. 3401 readiness (also reports the scanner as the app sees it).
$ready = Get-Http "http://127.0.0.1:$Port/api/health/ready"
$readyJson = $null
try { if ($ready.Body) { $readyJson = $ready.Body | ConvertFrom-Json } } catch { }
$serverOk = $ready.Status -eq 200 -and $readyJson.status -eq "ready"
$serverDetail = if ($serverOk) { "ready (database, CV storage ok)" }
  elseif ($ready.Status -eq 0) { "not running on 127.0.0.1:$Port" }
  else { "HTTP $($ready.Status), status '$($readyJson.status)'" }

# 4. ClamAV: container healthy and the app's scanner check ok.
$clamHealth = if ($dockerUp) { Get-ContainerHealth $ClamContainer } else { "unknown" }
$scanner = $readyJson.checks.scanner.status
$clamOk = $clamHealth -eq "healthy" -and $scanner -eq "ok"
$clamDetail = if ($clamOk) { "healthy, app scanner ok" }
  elseif ($clamHealth -ne "healthy") { "container $clamHealth (can take ~3 min after Docker starts)" }
  else { "app scanner check: $(if ($scanner) { $scanner } else { 'unknown (3401 down)' })" }
Add-Check "ClamAV" $clamOk $clamDetail
Add-Check "3401 readiness" $serverOk $serverDetail

# 5. Which build is served: only the served build's manifest returns 200.
$served = $null
foreach ($dir in ".next-live", ".next-live-final", ".next-live-h9v") {
  $idFile = Join-Path $Root "$dir\BUILD_ID"
  if (-not (Test-Path $idFile)) { continue }
  $buildId = (Get-Content $idFile -Raw).Trim()
  if ((Get-Http "http://127.0.0.1:$Port/_next/static/$buildId/_buildManifest.js" 5).Status -eq 200) { $served = "$dir ($buildId)"; break }
}
Add-Check "Build served" ([bool]$served) $(if ($served) { $served } else { "could not identify the served build" })

# 5b. Background workers: exactly one of each (see scripts/demo-workers.ps1).
. (Join-Path $PSScriptRoot "demo-workers.ps1")
$processes = @(Get-CimInstance Win32_Process)
$missing = @()
$duplicated = @()
foreach ($worker in $DemoWorkers) {
  $count = @(Get-DemoWorkerRoots $worker.Name $processes).Count
  if ($count -eq 0) { $missing += $worker.Name } elseif ($count -gt 1) { $duplicated += "$($worker.Name) x$count" }
}
$problems = @()
if ($missing.Count) { $problems += "not running: $($missing -join ', ')" }
if ($duplicated.Count) { $problems += "duplicate: $($duplicated -join ', ')" }
$workerDetail = if ($problems.Count -eq 0) { (($DemoWorkers | ForEach-Object { $_.Name }) -join ", ") + " running" } else { $problems -join "; " }
Add-Check "Workers" ($problems.Count -eq 0) $workerDetail

# 6. Tailscale funnel on, proxying to 3401, and matching APP_PUBLIC_URL.
$tailscale = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $tailscale) { $tailscale = "C:\Program Files\Tailscale\tailscale.exe" }
$funnelText = if (Test-Path $tailscale) { (& $tailscale funnel status 2>&1 | Out-String) } else { "" }
$publicUrl = "$($envVars["APP_PUBLIC_URL"])".TrimEnd("/")
$funnelOn = $funnelText -match "\(Funnel on\)" -and $funnelText -match "proxy http://127\.0\.0\.1:$Port"
$funnelMatches = $publicUrl -and $funnelText.Contains($publicUrl)
$funnelDetail = if (-not (Test-Path $tailscale)) { "tailscale not installed" }
  elseif (-not $funnelOn) { "funnel is off or not proxying to $Port" }
  elseif (-not $funnelMatches) { "APP_PUBLIC_URL is not the funnel URL" }
  else { "$publicUrl -> 127.0.0.1:$Port" }
Add-Check "Tailscale funnel" ($funnelOn -and $funnelMatches) $funnelDetail

# 7. Public URL end to end.
$public = if ($publicUrl) { Get-Http "$publicUrl/api/health/live" 15 } else { @{ Status = 0 } }
Add-Check "Public /api/health/live" ($public.Status -eq 200) $(if ($public.Status -eq 200) { "200" } elseif ($public.Status) { "HTTP $($public.Status)" } else { "unreachable" })

# 8. Env keys (names only).
$agora = Test-Keys @("AGORA_APP_ID", "AGORA_APP_CERTIFICATE", "AGORA_PIPELINE_ID")
Add-Check "Env: Agora" $agora.Pass $agora.Detail
$resend = Test-Keys @("RESEND_API_KEY", "EMAIL_FROM", "EMAIL_TEST_RECIPIENT")
$resendOk = $resend.Pass -and $envVars["EMAIL_PROVIDER"] -eq "resend"
Add-Check "Env: Resend" $resendOk $(if ($resend.Pass -and -not $resendOk) { "EMAIL_PROVIDER is not resend" } else { $resend.Detail })
$groq = Test-Keys @("GROQ_API_KEY")
$groqOk = $groq.Pass -and $envVars["ASSESSMENT_PROVIDER"] -eq "groq"
Add-Check "Env: Groq" $groqOk $(if ($groq.Pass -and -not $groqOk) { "ASSESSMENT_PROVIDER is not groq" } else { "$($groq.Detail), model $(if ($envVars['GROQ_ASSESSMENT_MODEL']) { $envVars['GROQ_ASSESSMENT_MODEL'] } else { 'default' })" })
Add-Check "Env: EMAIL_MODE=test" ($envVars["EMAIL_MODE"] -eq "test") $(if ($envVars["EMAIL_MODE"] -eq "test") { "test (emails go to EMAIL_TEST_RECIPIENT)" } else { "EMAIL_MODE is not test" })

# 9-11. Leftovers in the database.
$dbKnown = $dbRows.ContainsKey("db")
function Add-LeftoverCheck([string]$Name, [hashtable]$Parts) {
  if (-not $dbKnown) { Add-Check $Name $false "database not checked"; return }
  $found = @($Parts.Keys | Sort-Object | Where-Object { $dbRows[$_] } | ForEach-Object { "$($Parts[$_]): $(Format-Ids $dbRows[$_])" })
  Add-Check $Name ($found.Count -eq 0) $(if ($found.Count -eq 0) { "none" } else { $found -join "; " })
}
Add-LeftoverCheck "No Agora session RUNNING" @{ agora = "running" }
Add-LeftoverCheck "No queued emails" @{ email = "queued/sending" }
Add-LeftoverCheck "No pending jobs" @{ assessment = "assessment"; cvscan = "CV scan"; calendar = "calendar" }

# Table and verdict.
Write-Host ""
$width = ($results | ForEach-Object { $_.Check.Length } | Measure-Object -Maximum).Maximum
foreach ($r in $results) {
  $label = if ($r.Pass) { "PASS" } else { "FAIL" }
  Write-Host ("{0}  " -f $r.Check.PadRight($width)) -NoNewline
  Write-Host $label -ForegroundColor $(if ($r.Pass) { "Green" } else { "Red" }) -NoNewline
  Write-Host "  $($r.Detail)"
}
Write-Host ""
$failed = @($results | Where-Object { -not $_.Pass })
if ($failed.Count -eq 0) {
  Write-Host "READY: all $($results.Count) checks passed." -ForegroundColor Green
  exit 0
}
$first = $failed[0]
$more = if ($failed.Count -gt 1) { " (+$($failed.Count - 1) more failing)" } else { "" }
Write-Host "NOT READY: $($first.Check) - $($first.Detail)$more" -ForegroundColor Red
exit 1
