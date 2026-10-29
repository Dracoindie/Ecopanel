<#
.SYNOPSIS
  Stops the demo workers and the 3401 live server. Containers and the Tailscale funnel are left as they are.

.DESCRIPTION
  1. Stops the cv, email and assessment workers started by scripts/demo-up.ps1
     (matched by script name and .env.live.local; see scripts/demo-workers.ps1).
  2. Finds the process listening on 127.0.0.1:3401, confirms it is our
     `next start -p 3401` server, walks up to the launcher started by
     scripts/start-live.ps1 and ends that process tree. Refuses to touch anything
     else on 3401.

  Windows offers no graceful signal for a windowless console process, so each tree
  is ended directly. The server and workers keep no unsaved state: every write is a
  database transaction, an interrupted job's lease simply expires, and an email
  interrupted mid-send is marked failed (ambiguous) by the next worker rather than
  sent twice.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo-down.ps1
#>
$ErrorActionPreference = "Continue"
$Port = 3401
$failed = $false
. (Join-Path $PSScriptRoot "demo-workers.ps1")

# 1. Workers
$processes = @(Get-CimInstance Win32_Process)
foreach ($worker in $DemoWorkers) {
  $roots = @(Get-DemoWorkerRoots $worker.Name $processes)
  if ($roots.Count -eq 0) { Write-Host "$($worker.Name) worker is not running."; continue }
  foreach ($root in $roots) { taskkill /PID $root.ProcessId /T /F *> $null }
  Write-Host "Stopped $($worker.Name) worker (pid $(($roots | ForEach-Object { $_.ProcessId }) -join ', '))."
}
$processes = @(Get-CimInstance Win32_Process)
$left = @($DemoWorkers | Where-Object { (Get-DemoWorkerRoots $_.Name $processes).Count -gt 0 } | ForEach-Object { $_.Name })
if ($left.Count -gt 0) { Write-Host "Still running: $($left -join ', ') worker." -ForegroundColor Red; $failed = $true }

# 2. The 3401 server
# Matches every link of the launch: cmd /c npx next start -p 3401, npx-cli.js, and ...\bin\next" start -p 3401.
function Test-OurServer($Process) {
  $line = "$($Process.CommandLine)"
  return $line -match "next" -and $line -match "start -p $Port\b"
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Host "3401 is not running."
} else {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if (-not $process -or -not (Test-OurServer $process)) {
    Write-Host "REFUSED: port $Port is held by pid $($listener.OwningProcess) ($($process.Name)), which is not our Next.js server." -ForegroundColor Red
    exit 1
  }
  # Walk up through npx/cmd wrappers that belong to the same launch.
  $top = $process
  while ($true) {
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($top.ParentProcessId)"
    if (-not $parent -or -not (Test-OurServer $parent)) { break }
    $top = $parent
  }
  taskkill /PID $top.ProcessId /T /F *> $null
  $stopped = $false
  for ($i = 0; $i -lt 20; $i++) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { $stopped = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if ($stopped) { Write-Host "Stopped 3401 (process tree from pid $($top.ProcessId))." }
  else { Write-Host "3401 is still listening after 10 seconds." -ForegroundColor Red; $failed = $true }
}

if ($failed) { exit 1 }
Write-Host "Demo stopped. Containers and funnel left running."
exit 0
