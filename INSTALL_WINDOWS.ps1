$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:COREPACK_ENABLE_AUTO_PIN = "0"
Write-Host "Installing dependencies and refreshing lockfile..."
corepack pnpm install --no-frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
Write-Host "Building web assets..."
corepack pnpm exec vite build
if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }
if (!(Test-Path "android")) {
  corepack pnpm exec cap add android
  if ($LASTEXITCODE -ne 0) { throw "Android platform creation failed" }
}
corepack pnpm exec cap sync android
if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed" }
corepack pnpm exec cap open android
