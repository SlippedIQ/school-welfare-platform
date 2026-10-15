# Stops the Cloudflare tunnel and the local production server started by
# scripts\go-live.ps1.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\stop-live.ps1

$stopped = @()

Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force
    $stopped += "tunnel (PID $($_.Id))"
}

$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force
    $stopped += "next server (PID $($conn.OwningProcess))"
}

if ($stopped.Count -gt 0) {
    Write-Host "Stopped: $($stopped -join ', ')" -ForegroundColor Yellow
} else {
    Write-Host "Nothing was running."
}
