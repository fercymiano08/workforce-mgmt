# stop-all.ps1 - Stops all 8 microservices + the React frontend started by start-all.ps1.
# Run from PowerShell:  .\stop-all.ps1

$ErrorActionPreference = 'SilentlyContinue'

$ports = @(
  @{ name = 'core';           port = 8000 },
  @{ name = 'intelligence';   port = 8001 },
  @{ name = 'attendance';     port = 8003 },
  @{ name = 'scheduling';     port = 8004 },
  @{ name = 'timeoff';        port = 8005 },
  @{ name = 'payroll';        port = 8006 },
  @{ name = 'communications'; port = 8007 },
  @{ name = 'configuration';  port = 8008 },
  @{ name = 'frontend (5173)'; port = 5173 },
  @{ name = 'frontend (5174)'; port = 5174 }
)

Write-Host "Stopping the Workforce Management stack..." -ForegroundColor Cyan

foreach ($p in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $p.port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "  [skip] $($p.name) - nothing listening on port $($p.port)." -ForegroundColor DarkGray
    continue
  }
  $stopped = @()
  foreach ($conn in $conns) {
    $procId = $conn.OwningProcess
    if ($stopped -contains $procId) { continue }
    Stop-Process -Id $procId -Force -Confirm:$false -ErrorAction SilentlyContinue
    $stopped += $procId
  }
  Write-Host "  [ok]   $($p.name) on port $($p.port) stopped (PID $($stopped -join ', '))." -ForegroundColor Green
}

$schedulers = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%schedule:work%'" -ErrorAction SilentlyContinue
if ($schedulers) {
  foreach ($proc in $schedulers) {
    Stop-Process -Id $proc.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Host "  [ok]   background replica sync scheduler stopped ($($schedulers.Count) process(es))." -ForegroundColor Green
} else {
  Write-Host "  [skip] background replica sync scheduler - nothing running." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "All matched processes were signaled to stop. Re-run start-all.ps1 to bring the stack back up." -ForegroundColor Cyan
