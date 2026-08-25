$ErrorActionPreference = "Stop"

$taskName = "Codex Japanese Nightly Study Progress Commit"
$scriptPath = Join-Path $PSScriptRoot "nightly-study-commit.mjs"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$userId = "$env:USERDOMAIN\$env:USERNAME"

$actionParameters = @{
  Execute = $nodePath
  Argument = '"' + $scriptPath + '" --scheduled'
}
$action = New-ScheduledTaskAction @actionParameters

$triggerParameters = @{
  Daily = $true
  At = "3:00AM"
}
$trigger = New-ScheduledTaskTrigger @triggerParameters

$settingsParameters = @{
  StartWhenAvailable = $true
  WakeToRun = $true
  ExecutionTimeLimit = New-TimeSpan -Hours 4
}
$settings = New-ScheduledTaskSettingsSet @settingsParameters

$principalParameters = @{
  UserId = $userId
  LogonType = "Interactive"
  RunLevel = "Limited"
}
$principal = New-ScheduledTaskPrincipal @principalParameters

$registrationParameters = @{
  TaskName = $taskName
  Action = $action
  Trigger = $trigger
  Settings = $settings
  Principal = $principal
  Description = "Commit Japanese companion study progress fields between 03:00 and 06:00."
  Force = $true
}
Register-ScheduledTask @registrationParameters | Out-Null

Write-Host "Registered: $taskName"
