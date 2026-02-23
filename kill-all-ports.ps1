# Kill ALL processes that listen on ANY TCP port (and all node.exe).
# Excludes system PIDs (0, 4) to avoid breaking Windows.
# Run as Administrator to kill more processes.
# Usage: powershell -ExecutionPolicy Bypass -File kill-all-ports.ps1

$ErrorActionPreference = "SilentlyContinue"
$systemPids = @(0, 4)  # do not kill System

Write-Host "============================================"
Write-Host "  Kill ALL processes on ALL listening ports"
Write-Host "  + all node.exe"
Write-Host "============================================"
Write-Host ""

# 1) Kill all node.exe
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
foreach ($p in $nodeProcs) {
  Write-Host "[Node] Killing PID $($p.Id)"
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
if (-not $nodeProcs) { Write-Host "[Node] None found." }

# 2) All TCP listeners -> unique PIDs -> kill (skip system)
$pidsToKill = @{}
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $pid = $_.OwningProcess
  $port = $_.LocalPort
  if ($systemPids -contains $pid) { return }
  $pidsToKill[$pid] = $port  # keep one port per PID for log
}

foreach ($entry in $pidsToKill.GetEnumerator()) {
  $pid = $entry.Key
  $port = $entry.Value
  $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
  $name = if ($proc) { $proc.ProcessName } else { "?" }
  Write-Host "[Port $port] Killing $name (PID $pid)"
  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done. All listeners (except system) and node.exe have been killed."
Write-Host ""
