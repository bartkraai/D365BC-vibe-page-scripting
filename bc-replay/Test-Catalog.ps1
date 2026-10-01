<#
.SYNOPSIS
    Validates a catalog.json against its schema and checks that all referenced
    workflow folders exist and contain a valid workflow.json.

.DESCRIPTION
    Pre-flight validation for the 3-level test catalog (Type > Value Chain > Process Flow).
    Checks:
    - All workflow_path references resolve to existing folders with workflow.json
    - No duplicate codes within the same level
    - Reports orphan workflow folders (exist on disk but not in catalog)

.PARAMETER CatalogPath
    Path to catalog.json. Defaults to page-scripting/catalog.json relative to this script.

.PARAMETER PageScriptingRoot
    Root folder that contains the workflow project folders.
    Defaults to the parent folder of catalog.json.

.EXAMPLE
    .\Test-Catalog.ps1
    .\Test-Catalog.ps1 -CatalogPath "..\page-scripting\catalog.json"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$CatalogPath,

    [Parameter(Mandatory = $false)]
    [string]$PageScriptingRoot
)

$ErrorActionPreference = "Stop"

# ── Resolve paths ───────────────────────────────────────────────────────────
if (-not $CatalogPath) {
    $CatalogPath = Join-Path $PSScriptRoot "..\page-scripting\catalog.json"
}
if (-not (Test-Path $CatalogPath)) {
    Write-Error "catalog.json not found at: $CatalogPath"
    exit 1
}
$CatalogPath = Resolve-Path $CatalogPath

if (-not $PageScriptingRoot) {
    $PageScriptingRoot = Split-Path $CatalogPath -Parent
}
$PageScriptingRoot = Resolve-Path $PageScriptingRoot

# ── Load catalog ────────────────────────────────────────────────────────────
$catalog = Get-Content $CatalogPath -Raw | ConvertFrom-Json

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  BC Test Catalog Validation" -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Catalog : $CatalogPath" -ForegroundColor White
Write-Host "  Root    : $PageScriptingRoot" -ForegroundColor White
Write-Host ""

# ── Validate ────────────────────────────────────────────────────────────────
$errors   = @()
$warnings = @()
$info     = @()

$allWorkflowPaths = @()
$typeCodes = @()

foreach ($typ in $catalog.types) {
    $typLabel = "$($typ.code) ($($typ.name))"

    # Check duplicate Type codes
    if ($typ.code -in $typeCodes) {
        $errors += "Duplicate Type code: '$($typ.code)'"
    }
    $typeCodes += $typ.code

    if (-not $typ.value_chains -or $typ.value_chains.Count -eq 0) {
        $errors += "Type '$typLabel' has no Value Chains defined."
        continue
    }

    $vcCodes = @()
    foreach ($vc in $typ.value_chains) {
        $vcLabel = "$($typ.code)-$($vc.code) ($($vc.name))"

        # Check duplicate Value Chain codes within this Type
        if ($vc.code -in $vcCodes) {
            $errors += "Duplicate Value Chain code '$($vc.code)' in Type '$typLabel'"
        }
        $vcCodes += $vc.code

        if (-not $vc.process_flows -or $vc.process_flows.Count -eq 0) {
            $errors += "Value Chain '$vcLabel' has no process flows defined."
            continue
        }

        $pfCodes = @()
        foreach ($pf in $vc.process_flows) {
            $compositeCode = "$($typ.code)-$($vc.code)-$($pf.code)"
            $pfLabel = "$compositeCode ($($pf.name))"

            # Check duplicate process flow codes within this Value Chain
            if ($pf.code -in $pfCodes) {
                $errors += "Duplicate process flow code '$($pf.code)' in Value Chain '$vcLabel'"
            }
            $pfCodes += $pf.code

            # Resolve workflow path
            if (-not $pf.workflow_path) {
                $errors += "Process flow '$pfLabel': no workflow_path defined."
                continue
            }

            $resolvedPath = Join-Path $PageScriptingRoot $pf.workflow_path
            $allWorkflowPaths += $resolvedPath

            if (-not (Test-Path $resolvedPath -PathType Container)) {
                $errors += "Process flow '$pfLabel': folder not found: $resolvedPath"
                continue
            }

            $workflowJsonPath = Join-Path $resolvedPath "workflow.json"
            if (-not (Test-Path $workflowJsonPath)) {
                $errors += "Process flow '$pfLabel': no workflow.json in $resolvedPath"
                continue
            }

            # Validate the workflow.json loads
            try {
                $wf = Get-Content $workflowJsonPath -Raw | ConvertFrom-Json
                $stepCount = if ($wf.steps) { $wf.steps.Count } else { 0 }
                $info += "  $pfLabel : $stepCount steps"
            } catch {
                $errors += "Process flow '$pfLabel': workflow.json is invalid JSON: $_"
            }
        }
    }
}

# ── Check for orphan workflow folders ────────────────────────────────────────
$normalizedCatalogPaths = $allWorkflowPaths | ForEach-Object {
    if (Test-Path $_) { (Resolve-Path $_).Path } else { $_ }
}

$allFolders = Get-ChildItem -Path $PageScriptingRoot -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "workflow.json")
}

foreach ($folder in $allFolders) {
    if ($folder.FullName -notin $normalizedCatalogPaths) {
        $warnings += "Orphan workflow folder (not in catalog): $($folder.Name)"
    }
}

# ── Report ──────────────────────────────────────────────────────────────────
Write-Host "  Catalog structure:" -ForegroundColor White
foreach ($line in $info) {
    Write-Host $line -ForegroundColor DarkGray
}
Write-Host ""

$totalPF = ($catalog.types | ForEach-Object { $_.value_chains | ForEach-Object { $_.process_flows.Count } } | Measure-Object -Sum).Sum
$totalValueChains = ($catalog.types | ForEach-Object { $_.value_chains.Count } | Measure-Object -Sum).Sum

Write-Host "  Summary:" -ForegroundColor White
Write-Host "    Types         : $($catalog.types.Count)" -ForegroundColor White
Write-Host "    Value chains  : $totalValueChains" -ForegroundColor White
Write-Host "    Process flows : $totalPF" -ForegroundColor White
Write-Host ""

if ($warnings.Count -gt 0) {
    Write-Host "  Warnings:" -ForegroundColor Yellow
    foreach ($w in $warnings) {
        Write-Host "    [!] $w" -ForegroundColor Yellow
    }
    Write-Host ""
}

if ($errors.Count -gt 0) {
    Write-Host "  Errors:" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host "    [X] $e" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  VALIDATION FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  VALIDATION PASSED" -ForegroundColor Green
    exit 0
}
