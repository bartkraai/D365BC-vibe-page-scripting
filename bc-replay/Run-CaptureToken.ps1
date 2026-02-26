<#
.SYNOPSIS
    Capture a BC Bearer token and validate BC / 4PS API access.

.DESCRIPTION
    Runs capture-token.spec.js via Playwright. bc-replay handles the Entra ID
    login + TOTP MFA. The test intercepts the Bearer token and validates it
    against both the standard BC API and the 4PS custom extension API.

    Credentials are loaded from:
        page-scripting/PO Approval Workflow/users.json

.PARAMETER Role
    Which user from users.json to log in as. Default: purchaser.

.PARAMETER BcUrl
    Override the BC environment URL. Defaults to the 4psconstruct latestrelease.

.PARAMETER Headed
    Show the browser window (useful for watching login / debugging).

.EXAMPLE
    .\Run-CaptureToken.ps1
    .\Run-CaptureToken.ps1 -Headed
    .\Run-CaptureToken.ps1 -Role approver
#>

param(
    [string]$Role  = 'purchaser',
    [string]$BcUrl = '',
    [switch]$Headed
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# ── Optional BC_URL override ──────────────────────────────────────────────────
if ($BcUrl) {
    $env:BC_URL = $BcUrl
}

# ── Role selection ────────────────────────────────────────────────────────────
$env:BC_ROLE = $Role
Write-Host "Role     : $Role" -ForegroundColor Cyan

# ── Headed mode env var (read by capture.config.js) ──────────────────────────
$env:HEADED = if ($Headed) { '1' } else { '0' }

# ── Run ───────────────────────────────────────────────────────────────────────
Write-Host 'Running token capture test...' -ForegroundColor Cyan
Write-Host ''

npx playwright test --config=capture.config.js

# ── Show report ───────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'Opening HTML report...' -ForegroundColor DarkGray
npx playwright show-report ./capture-report

# ── Cleanup sensitive env vars ────────────────────────────────────────────────
Remove-Item Env:\BC_URL  -ErrorAction SilentlyContinue
Remove-Item Env:\BC_ROLE -ErrorAction SilentlyContinue
Remove-Item Env:\HEADED  -ErrorAction SilentlyContinue
