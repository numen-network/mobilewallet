$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$project = 'C:\APPS\NumenWallet_Android_iOS_Source'
if (!(Test-Path "$project\package.json")) { throw "Project not found: $project" }
$backup = Join-Path $project ('ui_patch_backup_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
$files = @('src/App.tsx','src/chain/provider.tsx','src/chain/config.ts','src/accounts/JobsHost.tsx','src/accounts/ActivitySheet.tsx','src/ui/ToolButton.tsx')
foreach ($rel in $files) {
  $original = Join-Path $project $rel
  if (Test-Path $original) {
    $backupPath = Join-Path $backup $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $backupPath) | Out-Null
    Copy-Item $original $backupPath
  }
  Copy-Item (Join-Path $PSScriptRoot "patch/$rel") $original -Force
}
# Case-insensitive Windows filename collision: src/accounts/Jobs.tsx vs src/accounts/jobs.ts
$oldJobs = Join-Path $project 'src/accounts/Jobs.tsx'
if (Test-Path $oldJobs) { Remove-Item $oldJobs -Force }
Push-Location $project
try {
  corepack pnpm run mobile:build
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed; Android app not updated.' }
  corepack pnpm exec cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
  Write-Host 'PATCH APPLIED AND ANDROID ASSETS SYNCED. Run app again from Android Studio.' -ForegroundColor Green
} finally { Pop-Location }
