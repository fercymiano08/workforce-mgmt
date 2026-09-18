# start-all.ps1 - Starts all 8 microservices + the React frontend.
# Run from PowerShell:  .\start-all.ps1
# Logs are written to .\logs\svc-<name>.log so errors can be checked later.

$ErrorActionPreference = 'SilentlyContinue'
$Root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$services = @(
  @{ name = 'core';           port = 8000 },
  @{ name = 'intelligence';   port = 8001 },
  @{ name = 'attendance';     port = 8003 },
  @{ name = 'scheduling';     port = 8004 },
  @{ name = 'timeoff';        port = 8005 },
  @{ name = 'payroll';        port = 8006 },
  @{ name = 'communications'; port = 8007 },
  @{ name = 'configuration';  port = 8008 }
)

Write-Host "Starting the Workforce Management microservices..." -ForegroundColor Cyan

foreach ($s in $services) {
  $busy = Get-NetTCPConnection -LocalPort $s.port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Write-Host "  [skip] $($s.name) - port $($s.port) is already in use." -ForegroundColor Yellow
    continue
  }
  $wd = Join-Path $Root ("backend\" + $s.name)
  Start-Process -FilePath 'php' -ArgumentList @('artisan', 'serve', "--port=$($s.port)") `
    -WorkingDirectory $wd -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "svc-$($s.name).out.log") `
    -RedirectStandardError  (Join-Path $LogDir "svc-$($s.name).err.log")
  Write-Host "  [ok]   $($s.name) on port $($s.port)" -ForegroundColor Green
}

# Services that keep a local replica of another service's data run Laravel's
# own scheduler in the background (`snapshot:sync` every minute - see
# routes/console.php in each). Employees and shift schedules are additionally
# pushed immediately on every write, so this is a safety net for everything
# else, not the only thing keeping replicas fresh. `withoutOverlapping()` on
# the schedule itself means running this twice is harmless.
$schedulerServices = @('attendance', 'intelligence', 'scheduling', 'timeoff', 'payroll')
foreach ($name in $schedulerServices) {
  $wd = Join-Path $Root ("backend\" + $name)
  Start-Process -FilePath 'php' -ArgumentList @('artisan', 'schedule:work') `
    -WorkingDirectory $wd -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "scheduler-$name.out.log") `
    -RedirectStandardError  (Join-Path $LogDir "scheduler-$name.err.log")
}
Write-Host "  [ok]   background replica sync scheduler started for: $($schedulerServices -join ', ')" -ForegroundColor Green

$frontBusy = Get-NetTCPConnection -LocalPort 5173,5174 -State Listen -ErrorAction SilentlyContinue
if (-not $frontBusy) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') `
    -WorkingDirectory (Join-Path $Root 'frontend') -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir 'frontend.out.log') `
    -RedirectStandardError  (Join-Path $LogDir 'frontend.err.log')
  Write-Host "  [ok]   frontend (Vite dev server)" -ForegroundColor Green
} else {
  Write-Host "  [skip] frontend - port 5173/5174 is already in use." -ForegroundColor Yellow
}

# --- Wait for every service to bind its port ----------------------------
# A freshly spawned `php artisan serve` needs a few seconds to boot before it
# can listen (core is the heaviest app of the eight). Poll instead of a fixed
# sleep, so we never health-check a service before its socket even exists.
$deadline = (Get-Date).AddSeconds(60)
$missing = @($services)
do {
  Start-Sleep -Seconds 2
  $missing = @($services | Where-Object {
    -not (Get-NetTCPConnection -LocalPort $_.port -State Listen -ErrorAction SilentlyContinue)
  })
} while ($missing.Count -gt 0 -and (Get-Date) -lt $deadline)

Write-Host ""
if ($missing.Count -gt 0) {
  Write-Host "  [!] not listening within 60s: $($missing.name -join ', ')" -ForegroundColor Yellow
} else {
  Write-Host "  all service ports are listening." -ForegroundColor Green
}

Write-Host ""
Write-Host "Health check (each service must answer /up):" -ForegroundColor Cyan
# The FIRST /up call after a fresh boot performs Laravel's cold boot plus a
# database ping - core alone can sit on that request for ~4s. On top of that,
# `php artisan serve` is single-threaded, so it cannot accept the next
# request while one is still running. A short timeout would fire right inside
# that window and report a healthy service as DOWN. Use a generous timeout
# and several spaced retries so a slow warm-up is never mistaken for a crash.
$nameByPort = @{}
foreach ($s in $services) { $nameByPort[$s.port] = $s.name }
foreach ($port in 8000, 8001, 8003, 8004, 8005, 8006, 8007, 8008) {
  $ok = $false
  for ($attempt = 1; $attempt -le 5 -and -not $ok; $attempt++) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/up" -UseBasicParsing -TimeoutSec 15
      $ok = ($r.StatusCode -eq 200)
    } catch { Start-Sleep -Milliseconds 500 }
    if (-not $ok -and $attempt -lt 5) { Start-Sleep -Seconds 3 }
  }
  $mark = if ($ok) { 'UP' } else { 'DOWN' }
  $color = if ($ok) { 'Green' } else { 'Red' }
  Write-Host "  port $port -> $mark" -ForegroundColor $color
  if (-not $ok) {
    Write-Host "      (see .\logs\svc-$($nameByPort[$port]).err.log for details)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Open the app in your browser:  http://localhost:5173  (or 5174 if 5173 was busy)" -ForegroundColor Cyan
Write-Host "Logged-in user: admin@workforcepro.com / Admin@123" -ForegroundColor Cyan