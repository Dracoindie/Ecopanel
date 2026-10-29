<#
.SYNOPSIS
  Stops the 3401 live server. Containers and the Tailscale funnel are left as they are.

.DESCRIPTION
  Finds the process listening on 127.0.0.1:3401, confirms it is our `next start -p 3401`
  server, walks up to the launcher started by scripts/start-live.ps1 and ends that
  process tree. The server keeps no unsaved state (every write is a database
  transaction), and Windows offers no graceful signal for a windowless console
  process, so the tree is ended directly. Refuses to touch anything else on 3401.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo-down.ps1
#>
$ErrorActionPreference = "Continue"
$Port = 3401
# Matches every link of the launch: cmd /c npx next start -p 3401, npx-cli.js, and ...\bin\next" start -p 3401.
function Test-OurServer($Process) {
  $line = "$($Process.CommandLine)"
  return $line -match "next" -and $line -match "start -p $Port\b"
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Host "3401 is not running. Nothing to stop."
  exit 0
}

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
for ($i = 0; $i -lt 20; $i++) {
  if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) {
    Write-Host "Stopped 3401 (process tree from pid $($top.ProcessId)). Containers and funnel left running."
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
Write-Host "3401 is still listening after 10 seconds." -ForegroundColor Red
exit 1
