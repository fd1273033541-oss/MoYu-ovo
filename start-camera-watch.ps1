$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:8787/"
$log = Join-Path $root "camera-server.log"
$errorLog = Join-Path $root "camera-server-error.log"

function Test-ServerReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $url
    return $response.StatusCode -eq 200 -and $response.Content -match 'camera-monitor.js'
  } catch {
    return $false
  }
}

try {
  $node = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"),
    "node"
  ) | Where-Object {
    if ($_ -eq "node") { $null -ne (Get-Command node -ErrorAction SilentlyContinue) }
    else { Test-Path -LiteralPath $_ }
  } | Select-Object -First 1

  if (-not $node) { throw "Node.js was not found." }

  $ready = Test-ServerReady

  if (-not $ready) {
    $processArgs = 'camera-server.js'
    Start-Process -FilePath $node -ArgumentList $processArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errorLog | Out-Null
    for ($attempt = 1; $attempt -le 20; $attempt++) {
      Start-Sleep -Milliseconds 500
      try {
        if (Test-ServerReady) { $ready = $true; break }
      } catch { }
    }
  }

  if (-not $ready) { throw "Server startup timed out. Check camera-server.log and camera-server-error.log." }
  Write-Host "Camera Watch is ready: $url"
  try { Start-Process $url -ErrorAction Stop | Out-Null } catch { Write-Host "Open the URL above in Edge or Chrome." }
  exit 0
}
catch {
  Write-Host "Camera Watch startup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Project directory: $root"
  Read-Host "Press Enter to close"
  exit 1
}
