# Starts the production server and a free Cloudflare quick tunnel, then prints
# the public URL you can share. Quick tunnels are ephemeral: the URL changes
# every time you stop and restart the tunnel.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\go-live.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- 1. Production server (skip if already listening on port 3000) ---
$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $portInUse) {
    Start-Process -FilePath "node" -ArgumentList "node_modules\next\dist\bin\next","start" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 40; $i++) {
        try {
            Invoke-WebRequest -Uri "http://localhost:3000/api/live/snapshot" -UseBasicParsing -TimeoutSec 2 | Out-Null
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    Write-Host "[1/2] Local server ready  ->  http://localhost:3000"
} else {
    Write-Host "[1/2] Local server already running on port 3000"
}

# --- 2. Cloudflare quick tunnel ---
$outLog = Join-Path $root "tools\tunnel.out.log"
$errLog = Join-Path $root "tools\tunnel.err.log"
Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

Start-Process -FilePath (Join-Path $root "tools\cloudflared.exe") -ArgumentList "tunnel --url http://localhost:3000" -WorkingDirectory $root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden | Out-Null

$url = $null
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $errLog) {
        $content = Get-Content $errLog -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $match = [regex]::Match($content, "https://[a-z0-9-]+\.trycloudflare\.com")
            if ($match.Success) {
                $url = $match.Value
                break
            }
        }
    }
}

if ($url) {
    Write-Host "[2/2] Cloudflare tunnel is live"
    Write-Host ""
    Write-Host "  PUBLIC URL:  $url" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Anyone you share this link with can open the platform."
    Write-Host "  Stop everything with:  powershell -ExecutionPolicy Bypass -File scripts\stop-live.ps1"
} else {
    Write-Host "[2/2] Tunnel did not report a URL - check tools\tunnel.err.log" -ForegroundColor Red
}
