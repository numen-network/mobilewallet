$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $project "android\app\src\main\res"
$dst = Join-Path $project "android\app\src\main\res"
if (!(Test-Path $src)) { throw "Android icon resources not found" }
Write-Host "Android launcher icons are already included in android/app/src/main/res." 
Write-Host "Build and reinstall the application to refresh the launcher icon."
