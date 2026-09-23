# start-all.ps1 - Starts the backend + its scheduler + the React frontend.
# Run from PowerShell:  .\start-all.ps1
# Logs are written to .\logs\*.log so errors can be checked later.

$ErrorActionPreference = 'SilentlyContinue'
$Root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-Host "Starting the Workforce Management stack..." -ForegroundColor Cyan

$backendWd = Join-Path $Root 'backend\app'

$busy = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "  [skip] backend - port 8000 is already in use." -ForegroundColor Yellow
} else {
  Start-Process -FilePath 'php' -ArgumentList @('artisan', 'serve', '--port=8000') `
    -WorkingDirectory $backendWd -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir 'backend.out.log') `
    -RedirectStandardError  (Join-Path $LogDir 'backend.err.log')
  Write-Host "  [ok]   backend on port 8000" -ForegroundColor Green
}

Start-Process -FilePath 'php' -ArgumentList @('artisan', 'schedule:work') `
  -WorkingDirectory $backendWd -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $LogDir 'scheduler.out.log') `
  -RedirectStandardError  (Join-Path $LogDir 'scheduler.err.log')
Write-Host "  [ok]   background scheduler started (early-out certificates, absence marking, auto-scheduling, timesheet workflow)" -ForegroundColor Green

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

# --- Wait for the backend to bind its port -------------------------------
$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Seconds 2
  $up = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
} while (-not $up -and (Get-Date) -lt $deadline)

Write-Host ""
if (-not $up) {
  Write-Host "  [!] backend not listening within 30s - see .\logs\backend.err.log" -ForegroundColor Yellow
} else {
  Write-Host "  backend is listening." -ForegroundColor Green
}

Write-Host ""
Write-Host "Health check (backend must answer /up):" -ForegroundColor Cyan
$ok = $false
for ($attempt = 1; $attempt -le 5 -and -not $ok; $attempt++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/up" -UseBasicParsing -TimeoutSec 15
    $ok = ($r.StatusCode -eq 200)
  } catch { Start-Sleep -Milliseconds 500 }
  if (-not $ok -and $attempt -lt 5) { Start-Sleep -Seconds 3 }
}
$mark = if ($ok) { 'UP' } else { 'DOWN' }
$color = if ($ok) { 'Green' } else { 'Red' }
Write-Host "  port 8000 -> $mark" -ForegroundColor $color
if (-not $ok) {
  Write-Host "      (see .\logs\backend.err.log for details)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Open the app in your browser:  http://localhost:5173  (or 5174 if 5173 was busy)" -ForegroundColor Cyan
Write-Host "Logged-in user: admin@workforcepro.com / Admin@123" -ForegroundColor Cyan
