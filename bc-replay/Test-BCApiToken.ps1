<#
.SYNOPSIS
    Validate Option A: reuse a BC browser-session Bearer token for direct API calls.

.DESCRIPTION
    Prompts for credentials, then runs test-api-token.js which:
      1. Logs into BC via Playwright (same Entra ID flow as npx-run.ps1)
      2. Extracts the Bearer token from MSAL storage or network interception
      3. Calls the standard BC API (GET companies) to verify the token works
      4. Calls the 4PS custom API (GET customers) to verify extension API works

    Use --Create to also POST a minimal test customer (Step C).

.PARAMETER BcUrl
    Full URL to your BC environment.
    Default: https://4psconstruct.bc.dynamics.com/34b93528-e939-4e0b-a370-e6b753ae2514/latestrelease

.PARAMETER Username
    BC account email. If not provided you will be prompted.

.PARAMETER Headed
    Show the browser window during execution (useful for debugging the login flow).

.PARAMETER Create
    Also run Step C: POST a minimal test customer to the 4PS API.

.EXAMPLE
    .\Test-BCApiToken.ps1

.EXAMPLE
    .\Test-BCApiToken.ps1 -Headed

.EXAMPLE
    .\Test-BCApiToken.ps1 -Create -Headed
#>
param(
    [Parameter(Mandatory = $false)]
    [string]$BcUrl = "https://4psconstruct.bc.dynamics.com/34b93528-e939-4e0b-a370-e6b753ae2514/latestrelease",

    [Parameter(Mandatory = $false)]
    [string]$Username,

    [Parameter(Mandatory = $false)]
    [string]$Role = "purchaser",

    [switch]$Headed,
    [switch]$Create
)

$ErrorActionPreference = "Stop"

# ── Ensure we run from the bc-replay folder ───────────────────────────────────
Set-Location $PSScriptRoot

# ── Load credentials from users.json (unless Username explicitly provided) ────
$usersJsonPath = "..\page-scripting\PO Approval Workflow\users.json"

if (-not $Username) {
    if (-not (Test-Path $usersJsonPath)) {
        Write-Error "users.json not found at: $usersJsonPath"
        exit 1
    }
    $users = Get-Content $usersJsonPath -Raw | ConvertFrom-Json
    $roleData = $users.$Role
    if (-not $roleData) {
        Write-Error "Role '$Role' not found in users.json. Available: $($users.PSObject.Properties.Name -join ', ')"
        exit 1
    }
    $Username      = $roleData.username
    $plainPassword = $roleData.password
    $env:BC_MFA_SEED = $roleData.mfa_seed
    Write-Host "Credentials loaded from users.json (role: $Role, MFA: $(if ($roleData.mfa_seed) { 'yes' } else { 'no' }))" -ForegroundColor DarkGray
} else {
    # Username provided explicitly — prompt for password
    $securePassword = Read-Host -AsSecureString "Password for $Username"
    $plainPassword  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    )
}

# ── Set environment variables ─────────────────────────────────────────────────
$env:BC_USERNAME = $Username
$env:BC_PASSWORD = $plainPassword
$env:BC_URL      = $BcUrl
# BC_MFA_SEED already set above if loaded from users.json

# ── Build node arguments ──────────────────────────────────────────────────────
$nodeArgs = @("test-api-token.js")
if ($Headed)  { $nodeArgs += "--headed" }
if ($Create)  { $nodeArgs += "--create" }

# ── Run ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host " BC API Token Validation (Option A)" -ForegroundColor Cyan
Write-Host " User: $Username" -ForegroundColor Cyan
Write-Host " URL:  $BcUrl" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

node @nodeArgs
$exitCode = $LASTEXITCODE

# ── Clean up credentials from environment ─────────────────────────────────────
$env:BC_USERNAME = $null
$env:BC_PASSWORD = $null
$env:BC_URL      = $null
$env:BC_MFA_SEED  = $null
[System.GC]::Collect()

# ── Exit summary ──────────────────────────────────────────────────────────────
Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "RESULT: Test completed — check SUMMARY above for Option A verdict." -ForegroundColor Green
} elseif ($exitCode -eq 2) {
    Write-Host "RESULT: No token captured. Option A not viable for this session." -ForegroundColor Red
} elseif ($exitCode -eq 3) {
    Write-Host "RESULT: Token captured but rejected by API (audience mismatch). Option A not viable." -ForegroundColor Red
} else {
    Write-Host "RESULT: Test failed with exit code $exitCode. Check errors above." -ForegroundColor Red
}
