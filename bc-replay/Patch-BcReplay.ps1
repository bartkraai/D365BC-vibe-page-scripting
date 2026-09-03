<#
.SYNOPSIS
    Removes the redundant browser installation check from bc-replay runtime startup.

.DESCRIPTION
    Chromium is installed by setup.ps1 and start.ps1. The upstream Replay.ps1 also
    runs `playwright install` before every replay, adding avoidable delay to every
    workflow step. This idempotent patch is applied after npm install.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$replayScript = Join-Path $PSScriptRoot 'node_modules\@microsoft\bc-replay\Replay.ps1'
$patchMarker = '# Browser installation is handled once by repository setup/startup.'

if (-not (Test-Path $replayScript)) {
    throw "bc-replay Replay.ps1 not found at: $replayScript"
}

$content = Get-Content $replayScript -Raw
if ($content.Contains($patchMarker)) {
    Write-Host 'bc-replay startup patch already applied.'
    exit 0
}

$installPattern = '(?m)^# Install the browser binaries that the test runner needs\r?\nnpx playwright install\r?\n'
if ($content -notmatch $installPattern) {
    if ($content -notmatch '(?m)^npx playwright install\s*$') {
        Write-Host 'bc-replay no longer installs browsers at runtime; no patch needed.'
        exit 0
    }
    throw 'bc-replay browser installation block changed; update Patch-BcReplay.ps1.'
}

$patchedContent = $content -replace $installPattern, "$patchMarker`r`n"
Set-Content -LiteralPath $replayScript -Value $patchedContent -NoNewline
Write-Host 'Applied bc-replay startup patch.'