<#
.SYNOPSIS
  Starts the isolated live-acceptance server on 127.0.0.1:3401 against ecopanel_test.

.DESCRIPTION
  Loads .env.live.local (git-ignored) into this process only, refuses to start
  unless the target is safe, then launches `next start` from .next-live in the
  background, logging to scratchpad/server-3401.log. No value is ever printed.

  Refuses when: .env.live.local is missing; APP_DATA_MODE is not "database";
  DATABASE_URL's database is not ecopanel_test; APP_PUBLIC_URL is not https;
  scripts/assert-safe-db.mjs fails; .next-live is missing (unless -Build);
  port 3401 is already in use. Never touches port 3400.

.PARAMETER Build
  Rebuild .next-live with the same safe environment before starting.

.PARAMETER BuildOnly
  With -Build: build .next-live and exit without starting the server.

.PARAMETER Rollback
  Start from the known-good backup .next-live-final (git tag pre-redesign: email,
  Groq and live interview working) instead of .next-live. Cannot be combined
  with -Build. The older .next-live-h9v (tag known-good-h9v) lacks email and Groq.

.PARAMETER Redesign
  Start from .next-live-redesign: a copy of the first redesign build (commit 961781e,
  BUILD_ID 20ZCw-oRUSiIaijeYBBWU), from before the login/report/completion animations.
  Cannot be combined with -Build or -Rollback.

.PARAMETER EnvFile
  Environment file to load (default .env.live.local in the repository root).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-live.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-live.ps1 -Build
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-live.ps1 -Rollback
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-live.ps1 -Redesign
#>
param([switch]$Build, [switch]$BuildOnly, [switch]$Rollback, [switch]$Redesign, [string]$EnvFile = "")

$ErrorActionPreference = "Stop"
$Port = 3401
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Stop-WithError([string]$Message) {
  Write-Host "REFUSED: $Message" -ForegroundColor Red
  exit 1
}

if ($Build -and $Rollback) { Stop-WithError "-Rollback starts the known-good backup; it cannot be combined with -Build." }
if ($Build -and $Redesign) { Stop-WithError "-Redesign starts the saved redesign build; it cannot be combined with -Build." }
if ($Rollback -and $Redesign) { Stop-WithError "choose one of -Rollback and -Redesign." }
if ($BuildOnly -and -not $Build) { Stop-WithError "-BuildOnly requires -Build." }
$DistDir = if ($Rollback) { ".next-live-final" } elseif ($Redesign) { ".next-live-redesign" } else { ".next-live" }

# 1. Load the env file into this process only (values are never echoed).
if (-not $EnvFile) { $EnvFile = Join-Path $Root ".env.live.local" }
if (-not (Test-Path $EnvFile)) { Stop-WithError "env file not found. See docs/AUDIT.md, 'Start live server'." }
foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') {
    $value = $Matches[2] -replace '^["'']|["'']$', ''
    Set-Item -Path "Env:$($Matches[1])" -Value $value
  }
}

# 2. Safety checks.
if ($env:APP_DATA_MODE -ne "database") { Stop-WithError "APP_DATA_MODE must be database." }
try { $db = [System.Uri]$env:DATABASE_URL } catch { Stop-WithError "DATABASE_URL is not a valid URL." }
if ($db.AbsolutePath.TrimStart("/") -ne "ecopanel_test") { Stop-WithError "DATABASE_URL must target the ecopanel_test database." }
try { $public = [System.Uri]$env:APP_PUBLIC_URL } catch { Stop-WithError "APP_PUBLIC_URL is not a valid URL." }
if ($public.Scheme -ne "https") { Stop-WithError "APP_PUBLIC_URL must be an https URL." }
if (-not $env:NEXT_PUBLIC_APP_URL) { $env:NEXT_PUBLIC_APP_URL = $env:APP_PUBLIC_URL }

# Native commands writing to stderr must not abort the script under "Stop"; check exit codes instead.
function Invoke-Native([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Command } finally { $ErrorActionPreference = $previous }
  return $LASTEXITCODE
}

$safeExit = Invoke-Native { & node scripts/assert-safe-db.mjs DATABASE_URL *> $null }
if ($safeExit -ne 0) { Stop-WithError "scripts/assert-safe-db.mjs rejected DATABASE_URL." }

. (Join-Path $PSScriptRoot "demo-workers.ps1")
if (Test-PortListening $Port) {
  Stop-WithError "port $Port is already in use. Stop the old 3401 server first."
}

$env:NEXT_DIST_DIR = $DistDir
$env:NODE_ENV = "production"
Write-Host "Checks passed: database mode, ecopanel_test, https public URL, safe-db guard, port $Port free. Build: $DistDir"

# 3. Optional build with the same environment.
if ($Build) {
  Write-Host "Building .next-live ..."
  $BuildLog = Join-Path $Root "scratchpad\build-live.log"
  New-Item -ItemType Directory -Force -Path (Split-Path $BuildLog) | Out-Null
  $buildExit = Invoke-Native { & npx next build *> $BuildLog }
  if ($buildExit -ne 0) { Stop-WithError "build failed; see scratchpad/build-live.log." }
}
if ($BuildOnly) {
  Write-Host "Built $DistDir (BUILD_ID $(Get-Content (Join-Path $Root "$DistDir\BUILD_ID"))). Server not started (-BuildOnly)."
  exit 0
}
if (-not (Test-Path (Join-Path $Root "$DistDir\BUILD_ID"))) { Stop-WithError "$DistDir has no build. Run with -Build (or without -Rollback/-Redesign)." }

# 4. Start detached; output goes to the log file only.
$LogDir = Join-Path $Root "scratchpad"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir "server-$Port.log"
$command = "npx next start -p $Port -H 127.0.0.1 >> `"$Log`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WindowStyle Hidden -PassThru

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 750
  try {
    $live = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://127.0.0.1:$Port/api/health/live"
    if ($live.StatusCode -eq 200) {
      Write-Host "Started: http://127.0.0.1:$Port (launcher pid $($process.Id)); log: scratchpad/server-$Port.log"
      exit 0
    }
  } catch { }
}
Stop-WithError "server did not become live within 30 seconds; see scratchpad/server-$Port.log."
