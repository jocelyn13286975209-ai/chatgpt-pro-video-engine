# AI Video Studio - Windows one-click launcher
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
Write-Host "=== AI Video Studio setup ===" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 22+ is required. Install from https://nodejs.org/ then rerun this script." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"; exit 1
}
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($nodeMajor -lt 22) { throw "Node.js 22 or newer is required. Current major: $nodeMajor" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "FFmpeg not found. Trying winget installation..." -ForegroundColor Yellow
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
  }
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "Please install FFmpeg and add it to PATH: https://ffmpeg.org/download.html" -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}
if (-not (Test-Path "node_modules")) { npm install }
npm run check
New-Item -ItemType Directory -Force -Path "video-data\uploads","video-data\renders" | Out-Null
Write-Host "Starting local studio at http://127.0.0.1:8787" -ForegroundColor Green
Start-Process "http://127.0.0.1:8787"
npm start
