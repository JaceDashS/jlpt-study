$ErrorActionPreference = "Stop"

$taskName = "Codex Japanese Nightly Study Progress Commit"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed: $taskName"
