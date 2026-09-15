
# ============================================================================
# Tharadon Guitar Store - Watchdog (one-shot check, run every 1 minute by
# Windows Task Scheduler task "GuitarStoreWatchdog").
#
# Checks whether the backend (port 3081) and frontend (port 8081) are
# listening. If either one is down, relaunches it silently (no visible
# window), so nobody can accidentally close a console window and take the
# site down. Safe to run repeatedly - it only starts what's missing.
#
# After the frontend/backend split, the backend code lives in .\backend and
# the frontend code lives in .\frontend.
# ============================================================================

$ProjectDir = "C:\Users\aoaww\OneDrive\Desktop\Inventory-main"
$BackendDir = Join-Path $ProjectDir "backend"
$FrontendDir = Join-Path $ProjectDir "frontend"
$LogFile = Join-Path $ProjectDir "watchdog.log"

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $LogFile -Value $line
    # Keep the log from growing forever - trim to the last ~200 lines.
    $lines = Get-Content -Path $LogFile -ErrorAction SilentlyContinue
    if ($lines.Count -gt 200) {
        Set-Content -Path $LogFile -Value ($lines[-200..-1])
    }
}

function Test-PortOpen($port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect("127.0.0.1", $port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(800)
        if ($ok) { $client.EndConnect($iar) }
        $client.Close()
        return $ok
    } catch {
        return $false
    }
}

if (-not (Test-PortOpen 3081)) {
    Write-Log "Backend (3081) is DOWN - restarting server-local.js"
    Start-Process -FilePath "node" -ArgumentList "server-local.js" -WorkingDirectory $BackendDir -WindowStyle Hidden
}

if (-not (Test-PortOpen 8081)) {
    Write-Log "Frontend (8081) is DOWN - restarting expo web"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx expo start --web --port 8081" -WorkingDirectory $FrontendDir -WindowStyle Hidden
}
