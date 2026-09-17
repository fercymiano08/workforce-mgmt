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

Start-Sleep -Seconds 8

Write-Host ""
Write-Host "Health check (each service must answer /up):" -ForegroundColor Cyan
foreach ($port in 8000, 8001, 8003, 8004, 8005, 8006, 8007, 8008) {
  $ok = $false
  # A fresh php artisan serve can take a few seconds longer than expected the
  # first time (e.g. right after a big file move/sync) - retry a couple of
  # times before reporting DOWN, so a slow boot isn't mistaken for a crash.
  for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/up" -UseBasicParsing -TimeoutSec 4
      $ok = ($r.StatusCode -eq 200)
    } catch { }
    if (-not $ok -and $attempt -lt 3) { Start-Sleep -Seconds 3 }
  }
  $mark = if ($ok) { 'UP' } else { 'DOWN' }
  $color = if ($ok) { 'Green' } else { 'Red' }
  Write-Host "  port $port -> $mark" -ForegroundColor $color
}

Write-Host ""
Write-Host "Open the app in your browser:  http://localhost:5173  (or 5174 if 5173 was busy)" -ForegroundColor Cyan
Write-Host "Logged-in user: admin@workforcepro.com / Admin@123" -ForegroundColor Cyan