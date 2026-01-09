#
# Cadre CLI Installation Script for Windows
# Usage: iwr -useb https://raw.githubusercontent.com/yoave717/cadre/main/scripts/install.ps1 | iex
#

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║       Cadre CLI Installation          ║" -ForegroundColor Blue
Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# Check for Node.js
try {
    $nodeVersion = node -v
    Write-Host "✓ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js 20+ from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Check Node.js version
$versionNumber = $nodeVersion -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$versionNumber -lt 20) {
    Write-Host "Error: Node.js version 20+ is required." -ForegroundColor Red
    Write-Host "Current version: $nodeVersion" -ForegroundColor Yellow
    Write-Host "Please upgrade Node.js from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Check for npm
try {
    $npmVersion = npm -v
    Write-Host "✓ npm $npmVersion detected" -ForegroundColor Green
} catch {
    Write-Host "Error: npm is not installed." -ForegroundColor Red
    exit 1
}

# Install cadre globally
Write-Host ""
Write-Host "Installing Cadre CLI..." -ForegroundColor Blue

try {
    npm install -g cadre 2>$null
    Write-Host "✓ Cadre installed successfully!" -ForegroundColor Green
} catch {
    Write-Host "Installing from GitHub..." -ForegroundColor Yellow
    npm install -g "git+https://github.com/yoave717/cadre.git"
    Write-Host "✓ Cadre installed from GitHub!" -ForegroundColor Green
}

# Verify installation
try {
    $cadreVersion = cadre --version
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║     Installation Complete!            ║" -ForegroundColor Green
    Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "To get started:"
    Write-Host "  1. Configure your API key:"
    Write-Host "     cadre config --key <your-openai-api-key>" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Or create a .env file:"
    Write-Host "     echo 'OPENAI_API_KEY=sk-...' > .env" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. Start Cadre:"
    Write-Host "     cadre" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Run cadre --help for more options." -ForegroundColor Blue
} catch {
    Write-Host "Installation may have failed. Please try manually:" -ForegroundColor Red
    Write-Host "npm install -g cadre" -ForegroundColor Yellow
    exit 1
}
