# scaffold.ps1 — builds a new extracted microservice from the core service.
# Usage:  powershell -ExecutionPolicy Bypass -File services/_templates/scaffold.ps1
#   -Name configuration -Port 8008 -Db workforce_configuration `
#   -Controllers SettingsController -Models Setting -Migrations 2026_08_11_060800_create_settings_table `
#   -MockFiles settings -ServiceRoutes configuration -Tests SettingsTest -SnapshotGlobal $false
param(
  [Parameter(Mandatory)][string]$Name,
  [Parameter(Mandatory)][int]$Port,
  [Parameter(Mandatory)][string]$DatabaseName,
  [Parameter(Mandatory)][string[]]$Controllers,
  [Parameter(Mandatory)][string[]]$Models,
  [Parameter(Mandatory)][string[]]$Migrations,
  [string[]]$MockFiles = @(),
  [string[]]$ServiceRoutes = @(),
  [string[]]$Services = @(),
  [string[]]$Tests = @(),
  [bool]$SnapshotGlobal = $false,
  [string]$InternalController = $null,
  [string]$InternalRoutes = $null
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backend = Join-Path (Join-Path $root 'services') 'core'
$dest = Join-Path $root "services\$Name"

if (Test-Path $dest) { Write-Error "Destination already exists: $dest" }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
robocopy $backend $dest /E /NFL /NDL /NJH /NJS /NP | Out-Null

# --- prune controllers ---
Get-ChildItem (Join-Path $dest 'app\Http\Controllers\Api') -Filter *.php | ForEach-Object {
  if ($_.BaseName -notin $Controllers) { Remove-Item $_.FullName -Force }
}
# --- prune models ---
Get-ChildItem (Join-Path $dest 'app\Models') -Filter *.php | ForEach-Object {
  if ($_.BaseName -notin $Models) { Remove-Item $_.FullName -Force }
}
# Every extracted service's test suite relies on the User model + factory
# (the TestCase::adminUser() helper). Always keep both.
if (-not (Test-Path (Join-Path $dest 'app\Models\User.php'))) {
  Copy-Item (Join-Path $backend 'app\Models\User.php') (Join-Path $dest 'app\Models\User.php')
}
if (-not (Test-Path (Join-Path $dest 'database\factories\UserFactory.php'))) {
  Copy-Item (Join-Path $backend 'database\factories\UserFactory.php') (Join-Path $dest 'database\factories\UserFactory.php')
}
# --- prune migrations ---
Get-ChildItem (Join-Path $dest 'database\migrations') -Filter *.php | ForEach-Object {
  if ($_.Name -notin $Migrations) { Remove-Item $_.FullName -Force }
}
# The tests create users via the factory, so the users/cache/jobs framework
# migrations are always required.
foreach ($framework in @('0001_01_01_000000_create_users_table.php','0001_01_01_000001_create_cache_table.php','0001_01_01_000002_create_jobs_table.php')) {
  if (-not (Test-Path (Join-Path $dest "database\migrations\$framework"))) {
    Copy-Item (Join-Path $backend "database\migrations\$framework") (Join-Path $dest "database\migrations\$framework")
  }
}
# --- prune services ---
if ($Services -or $true) {
  Get-ChildItem (Join-Path $dest 'app\Services') -Filter *.php | ForEach-Object {
    if ($_.BaseName -notin $Services) { Remove-Item $_.FullName -Force }
  }
}
# --- prune mock data ---
Get-ChildItem (Join-Path $dest 'database\mock') -Filter *.json | ForEach-Object {
  if ($_.BaseName -notin $MockFiles) { Remove-Item $_.FullName -Force }
}
# --- prune tests ---
Get-ChildItem (Join-Path $dest 'tests\Feature') -Filter *.php | ForEach-Object {
  if ($_.BaseName -notin $Tests) { Remove-Item $_.FullName -Force }
}
Get-ChildItem (Join-Path $dest 'tests\Unit') -Filter *.php | ForEach-Object {
  if ($_.Name -ne 'ExampleTest.php') { Remove-Item $_.FullName -Force }
}
# --- copy shared templates ---
$tpl = Join-Path $root 'services\_templates'
Copy-Item (Join-Path $tpl 'EnsureServiceAuthenticated.php') (Join-Path $dest 'app\Http\Middleware\EnsureServiceAuthenticated.php')
Copy-Item (Join-Path $tpl 'SyncSnapshot.php') (Join-Path $dest 'app\Http\Middleware\SyncSnapshot.php')
Copy-Item (Join-Path $tpl 'SnapshotSyncService.php') (Join-Path $dest 'app\Services\SnapshotSyncService.php')
Copy-Item (Join-Path $tpl 'NotificationClient.php') (Join-Path $dest 'app\Services\NotificationClient.php')
Copy-Item (Join-Path $tpl 'EnsureUserIsAdministrator.php') (Join-Path $dest 'app\Http\Middleware\EnsureUserIsAdministrator.php')
Copy-Item (Join-Path $tpl 'config-svc.php') (Join-Path $dest 'config\svc.php')
if ($InternalController) {
  Copy-Item (Join-Path $tpl $InternalController) (Join-Path $dest "app\Http\Controllers\Api\InternalApiController.php")
}
-join ('scaffolded {0} at {1}' -f $Name, $dest) | Write-Output