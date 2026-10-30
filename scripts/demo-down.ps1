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

# 2. The 3401 server, found by command line (the listener's owning pid is unreliable; see demo-workers.ps1).
$roots = @(Get-LiveServerRoots $Port @(Get-CimInstance Win32_Process))
if ($roots.Count -eq 0) {
  if (Test-PortListening $Port) {
    Write-Host "REFUSED: port $Port is in use, but not by our Next.js server (no 'next start -p $Port' process)." -ForegroundColor Red
    exit 1
  }
  Write-Host "3401 is not running."
} else {
  foreach ($root in $roots) { taskkill /PID $root.ProcessId /T /F *> $null }
  $stopped = $false
  for ($i = 0; $i -lt 20; $i++) {
    if (-not (Test-PortListening $Port)) { $stopped = $true; break }
    Start-Sleep -Milliseconds 500
  }
  $pids = ($roots | ForEach-Object { $_.ProcessId }) -join ', '
  if ($stopped) { Write-Host "Stopped 3401 (process tree from pid $pids)." }
  else { Write-Host "3401 is still listening after 10 seconds." -ForegroundColor Red; $failed = $true }
}

if ($failed) { exit 1 }
Write-Host "Demo stopped. Containers and funnel left running."
exit 0
