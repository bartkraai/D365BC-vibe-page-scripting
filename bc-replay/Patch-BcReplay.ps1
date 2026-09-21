<#
.SYNOPSIS
    Removes the redundant browser installation check from bc-replay runtime startup.

.DESCRIPTION
    Chromium is installed by setup.ps1 and start.ps1. The upstream Replay.ps1 also
    runs `playwright install` before every replay, adding avoidable delay to every
    workflow step. This idempotent patch is applied after npm install.
    Also patches the player's MFA handling: Commands.js unconditionally tries to
    fill a TOTP field whenever a seed is configured, even if Entra ID skipped the
    MFA challenge for that sign-in (e.g. it went straight to the "Stay signed in?"
    prompt). That threw "The MFA field is not visible!" and aborted the workflow.
    The patch only attempts TOTP/certificate entry when an MFA challenge is
    actually visible, so a skipped challenge falls through to normal KMSI handling.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$replayScript = Join-Path $PSScriptRoot 'node_modules\@microsoft\bc-replay\Replay.ps1'
$patchMarker = '# Browser installation is handled once by repository setup/startup.'
$cliMarker = '# Playwright CLI resolved from bc-replay dependency.'
$commandsScript = Join-Path $PSScriptRoot 'node_modules\@microsoft\bc-replay\player\dist\Commands.js'
$mfaPatchMarker = '// Patch: only attempt MFA entry when Entra ID actually presented a challenge.'

if (-not (Test-Path $replayScript)) {
    throw "bc-replay Replay.ps1 not found at: $replayScript"
}

$content = Get-Content $replayScript -Raw
if ($content.Contains($patchMarker) -and $content.Contains($cliMarker)) {
    Write-Host 'bc-replay startup patch already applied.'
}
else {
    $patchedContent = $content
    $installPattern = '(?m)^\s*# Install the browser binaries[^\r\n]*\r?\n\s*npx playwright install[^\r\n]*\r?$'
    if ($patchedContent -notmatch $patchMarker) {
        if ($patchedContent -notmatch $installPattern) {
            $installPattern = '(?m)^\s*npx playwright install[^\r\n]*\r?$'
        }
        if ($patchedContent -match $installPattern) {
            $patchedContent = $patchedContent -replace $installPattern, "$patchMarker`r`n"
        }
    }

    $cliPattern = '(?m)^npx playwright test '
    if ($patchedContent -notmatch $cliMarker -and $patchedContent -match $cliPattern) {
        $cliCommand = "node (Join-Path `$PSScriptRoot '..\..\@playwright\test\cli.js') test "
        $patchedContent = $patchedContent -replace $cliPattern, "$cliMarker`r`n$cliCommand"
    }

    if ($patchedContent -eq $content) {
        Write-Host 'bc-replay launcher already avoids runtime browser installation.'
    }
    else {
        Set-Content -LiteralPath $replayScript -Value $patchedContent -NoNewline
        Write-Host 'Applied bc-replay startup patch.'
    }
}

if (-not (Test-Path $commandsScript)) {
    throw "bc-replay Commands.js not found at: $commandsScript"
}

$commandsContent = Get-Content $commandsScript -Raw
if ($commandsContent.Contains($mfaPatchMarker)) {
    Write-Host 'bc-replay MFA-skip patch already applied.'
    exit 0
}

$mfaOriginal = @'
async function authenticateAadMfa(page, mfaType, mfaSecret) {
    await isMfaFlowVisible(page);
    switch (mfaType) {
        case "totp":
            await authenticateWithTotp(page, mfaSecret);
            break;
        case "certificate":
            await authenticateWithCertificate(page);
            break;
    }
    if (await isMfaFlowVisible(page)) {
        throw new Error("MFA authentication failed!");
    }
}
'@

$mfaReplacement = @"
async function authenticateAadMfa(page, mfaType, mfaSecret) {
    $mfaPatchMarker
    const mfaFlowVisible = await isMfaFlowVisible(page);
    if (mfaFlowVisible) {
        switch (mfaType) {
            case "totp":
                await authenticateWithTotp(page, mfaSecret);
                break;
            case "certificate":
                await authenticateWithCertificate(page);
                break;
        }
    }
    if (await isMfaFlowVisible(page)) {
        throw new Error("MFA authentication failed!");
    }
}
"@

$mfaOriginal = $mfaOriginal.Replace("`r`n", "`n")
$mfaReplacement = $mfaReplacement.Replace("`r`n", "`n")

if (-not $commandsContent.Contains($mfaOriginal)) {
    throw "bc-replay Commands.js did not match the expected authenticateAadMfa implementation; skipping MFA-skip patch to avoid corrupting the file."
}

$patchedCommandsContent = $commandsContent.Replace($mfaOriginal, $mfaReplacement)
Set-Content -LiteralPath $commandsScript -Value $patchedCommandsContent -NoNewline
Write-Host 'Applied bc-replay MFA-skip patch.'