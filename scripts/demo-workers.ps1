# Dot-sourced by demo-up.ps1, demo-down.ps1 and demo-check.ps1: the background workers the demo runs.
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
