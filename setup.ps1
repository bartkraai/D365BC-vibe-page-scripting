<#
.SYNOPSIS
    First-time setup and pre-flight check for BC Page Scripting.

.DESCRIPTION
    Run this script once when you first clone the repository.
    It checks that all required tools are installed, installs npm packages,
    installs Playwright browsers, and then opens the Workflow Builder in your browser.

.EXAMPLE
    .\setup.ps1
    .\setup.ps1 -SkipBrowser   # skip auto-opening the Workflow Builder
#>

param(
    [switch]$SkipBrowser,
    [switch]$SkipUpdate,
    [switch]$ForceUpdate
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  BC Page Scripting — Setup & Pre-Flight Check" -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# ── Helper ──────────────────────────────────────────────────────────────────
function Write-Check {
    param([bool]$Passed, [string]$Label, [string]$FixHint = "")
    if ($Passed) {
        Write-Host "  [OK] $Label" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $Label" -ForegroundColor Red
        if ($FixHint) {
            Write-Host "       --> $FixHint" -ForegroundColor Yellow
        }
        $script:allPassed = $false
    }
}

# ── 1. PowerShell version ────────────────────────────────────────────────────
Write-Host "Checking prerequisites..." -ForegroundColor White
$psVersion = $PSVersionTable.PSVersion
$psOk = $psVersion.Major -ge 7
$psFix = if (-not $psOk) { "Install PowerShell 7+ from: https://aka.ms/powershell-release" } else { "" }
Write-Check $psOk "PowerShell $psVersion" $psFix

# ── 2. Node.js ───────────────────────────────────────────────────────────────
$nodeOk = $false
$nodeVersion = ""
try {
    $nodeRaw = (node --version 2>&1)
    if ($nodeRaw -match "v(\d+)\.(\d+)") {
        $nodeMajor = [int]$Matches[1]
        $nodeMinor = [int]$Matches[2]
        $nodeOk = $nodeMajor -gt 16 -or ($nodeMajor -eq 16 -and $nodeMinor -ge 14)
        $nodeVersion = $nodeRaw
    }
} catch { }
$nodeFix = if (-not $nodeOk) { "Install from: https://nodejs.org  (LTS version)" } else { "" }
Write-Check $nodeOk "Node.js $nodeVersion (requires 16.14+)" $nodeFix

# ── 3. npm install ───────────────────────────────────────────────────────────
$bcReplayDir = Join-Path $repoRoot "bc-replay"
$playwrightCli = Join-Path $bcReplayDir "node_modules\@playwright\test\cli.js"
$nodeModules  = Join-Path $bcReplayDir "node_modules"
$packageJson  = Join-Path $bcReplayDir "package.json"

if ($nodeOk) {
    if (-not (Test-Path $nodeModules)) {
        Write-Host "  [..] Installing npm packages in bc-replay/..." -ForegroundColor Yellow
        Push-Location $bcReplayDir
        try {
            npm install --silent
            Write-Check $true "npm install (bc-replay dependencies)"
        } catch {
            Write-Check $false "npm install" "Run manually: cd bc-replay && npm install"
        } finally {
            Pop-Location
        }
    } else {
        $shouldUpdate = $false
        if ($ForceUpdate) {
            $shouldUpdate = $true
        } elseif (-not $SkipUpdate -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
            $answer = Read-Host "  Update dependencies to latest? (Y/n)"
            if ($answer -notmatch '^(n|no)$') {
                $shouldUpdate = $true
            }
        }

        if ($shouldUpdate) {
            Write-Host "  [..] Updating dependencies to latest..." -ForegroundColor Yellow
            Push-Location $bcReplayDir
            try {
                npm update --silent
                Write-Check $true "bc-replay dependencies updated to latest"
            } catch {
                Write-Check $true "npm packages already installed"
            } finally {
                Pop-Location
            }
        } else {
            Write-Check $true "npm packages already installed (updates skipped)"
        }
    }
} else {
    Write-Check $false "npm install (skipped - Node.js not found)" ""
}

# Reapply the bc-replay launcher patch after installs and updates.
if ($nodeOk -and (Test-Path (Join-Path $bcReplayDir "Patch-BcReplay.ps1"))) {
    Push-Location $bcReplayDir
    try { & "$PSScriptRoot\bc-replay\Patch-BcReplay.ps1" } finally { Pop-Location }
}

# ── 4. Playwright Chromium ───────────────────────────────────────────────────
if ($nodeOk) {
    $chromiumOk = $false
    try {
        Push-Location $bcReplayDir
        $playwrightCheck = node $playwrightCli install --dry-run chromium 2>&1
        # If "already installed" or "browser chromium is installed" - it's fine
        # Safer: just check if the chromium executable exists in the playwright cache
        $playwrightCachePaths = @(
            "$env:USERPROFILE\AppData\Local\ms-playwright",
            "$env:LOCALAPPDATA\ms-playwright"
        )
        $chromiumOk = $playwrightCachePaths | Where-Object { Test-Path $_ } | ForEach-Object {
            Get-ChildItem "$_\chromium*" -ErrorAction SilentlyContinue
        } | Select-Object -First 1
        Pop-Location
    } catch { }

    if (-not $chromiumOk) {
        Write-Host "  [..] Installing Playwright Chromium browser..." -ForegroundColor Yellow
        Push-Location $bcReplayDir
        try {
            node $playwrightCli install chromium 2>&1 | Out-Null
            Write-Check $true "Playwright Chromium browser installed"
        } catch {
            Write-Check $false "Playwright Chromium" "Run manually: cd bc-replay && node node_modules/@playwright/test/cli.js install chromium"
        } finally {
            Pop-Location
        }
    } else {
        Write-Check $true "Playwright Chromium browser"
    }
}

# ── 5. bc-replay version ─────────────────────────────────────────────────────
$bcReplayPkg = Join-Path $bcReplayDir "node_modules\@microsoft\bc-replay\package.json"
if (Test-Path $bcReplayPkg) {
    $bcVersion = ((Get-Content $bcReplayPkg -Raw | ConvertFrom-Json).version)
    Write-Check $true "bc-replay v$bcVersion installed"
} else {
    if ($nodeOk) {
        Write-Check $false "bc-replay not found" "Run: cd bc-replay && npm install"
    }
}

# ── 6. users.json placeholder check ─────────────────────────────────────────
$usersJsonFiles = Get-ChildItem -Path $repoRoot -Recurse -Filter "users.json" -ErrorAction SilentlyContinue
$credentialsOk = $true
foreach ($f in $usersJsonFiles) {
    $content = Get-Content $f.FullName -Raw
    if ($content -match '"password"\s*:\s*"(?!your-password-here)[^"]{8,}"') {
        Write-Check $false "Credentials check - $($f.FullName)" "This file may contain real credentials. Verify it is gitignored."
        $credentialsOk = $false
    }
}
if ($credentialsOk -and $usersJsonFiles) {
    Write-Check $true "Credentials check (no obvious real passwords detected)"
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
if ($allPassed) {
    Write-Host "  All checks passed. You are ready to go!" -ForegroundColor Green
} else {
    Write-Host "  Some checks failed. Fix the issues above before running tests." -ForegroundColor Red
    Write-Host ""
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Next Steps" -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Open the Workflow Builder to design your workflow" -ForegroundColor White
Write-Host "     (auto-opening now...)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  2. Copy users.sample.json to users.json in your workflow folder" -ForegroundColor White
Write-Host "     and fill in real credentials" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  3. Run your workflow:" -ForegroundColor White
Write-Host "     cd bc-replay" -ForegroundColor DarkGray
Write-Host '     .\Run-BCWorkflow.ps1 -WorkflowPath "..\page-scripting\PO Approval Workflow"' -ForegroundColor DarkGray
Write-Host ""
Write-Host "  For variant batch testing (single user):" -ForegroundColor White
Write-Host "     cd bc-replay" -ForegroundColor DarkGray
Write-Host '     .\npx-run.ps1 -ScriptPath "..\page-scripting\MyProject\Variants\*.yml" -BcUrl "https://businesscentral.dynamics.com/tenant/env"' -ForegroundColor DarkGray
Write-Host ""

# ── Open Workflow Builder ────────────────────────────────────────────────────
if (-not $SkipBrowser) {
    $builderPath = Join-Path $repoRoot "tools\workflow-builder\index.html"
    if (Test-Path $builderPath) {
        Start-Process $builderPath
    }
}
