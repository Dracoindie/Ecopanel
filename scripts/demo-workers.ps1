# Dot-sourced by demo-up.ps1, demo-down.ps1, demo-check.ps1 and start-live.ps1: the background workers
# the demo runs, and how to find the 3401 server.
# Each runs against .env.live.local; the CV worker skips its backfill so only CVs uploaded from now on
# are scanned. Old Cancelled/Failed rows are never claimed by any worker.
$DemoWorkers = @(
  @{ Name = "cv"; Script = "scripts/cv-worker.ts"; Extra = "--no-backfill" },
  @{ Name = "email"; Script = "scripts/email-worker.ts"; Extra = "" },
  @{ Name = "assessment"; Script = "scripts/assessment-worker.ts"; Extra = "" }
)

# Long-running demo workers only: one-shot runs (--job / --message) and .env.local workers are not matched.
function Test-DemoWorkerLine([string]$Line, [string]$Name) {
  return $Line -match "scripts[\\/]$Name-worker\.ts" -and $Line -match "\.env\.live\.local" -and $Line -notmatch "--(job|message)\b"
}

# The top process of each running launch chain (cmd -> npx -> tsx -> node) for one worker.
function Get-DemoWorkerRoots([string]$Name, $Processes) {
  $matched = @($Processes | Where-Object { Test-DemoWorkerLine "$($_.CommandLine)" $Name })
  $ids = @($matched | ForEach-Object { $_.ProcessId })
  return @($matched | Where-Object { $ids -notcontains $_.ParentProcessId })
}

# Whether anything accepts connections on 127.0.0.1:$Port. Connects instead of reading the socket table:
# on this machine Get-NetTCPConnection/netstat report the 3401 listener as pid 0 or omit it entirely.
function Test-PortListening([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { return $client.ConnectAsync("127.0.0.1", $Port).Wait(1000) -and $client.Connected } catch { return $false } finally { $client.Dispose() }
}

# The top process of each running 3401 server launch chain (cmd /c npx next start -> npx-cli.js -> cmd -> next),
# found by command line because the listener's owning pid is not reliable here (see Test-PortListening).
function Get-LiveServerRoots([int]$Port, $Processes) {
  $matched = @($Processes | Where-Object { "$($_.CommandLine)" -match "next" -and "$($_.CommandLine)" -match "start -p $Port\b" })
  $ids = @($matched | ForEach-Object { $_.ProcessId })
  return @($matched | Where-Object { $ids -notcontains $_.ParentProcessId })
}

# Whether 127.0.0.1:$Port serves the build in $DistDir: only the served build's manifest returns 200.
function Test-ServesBuild([int]$Port, [string]$Root, [string]$DistDir) {
  $id = Get-Content (Join-Path $Root "$DistDir\BUILD_ID") -Raw -ErrorAction SilentlyContinue
  if (-not $id) { return $false }
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$Port/_next/static/$($id.Trim())/_buildManifest.js").StatusCode -eq 200 } catch { return $false }
}
