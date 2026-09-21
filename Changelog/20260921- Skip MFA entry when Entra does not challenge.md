# Skip MFA entry when Entra does not challenge

## Context

A workflow run for "Projecten (vaste termijnen)" failed on step 1 with `Error: The MFA field is not visible!`. The captured page snapshot showed Entra ID went straight from the password screen to the "Stay signed in?" (KMSI) prompt, without presenting an MFA challenge. bc-replay's `authenticateAadMfa` (in `@microsoft/bc-replay`) unconditionally tries to fill a TOTP field whenever a seed is configured, regardless of whether Entra actually asked for one, so it throws and aborts the workflow (`-StopOnFailure`).

Likely cause on the identity side: Entra decided MFA was already satisfied for this sign-in (session/device trust, Conditional Access), or the account's MFA requirement was otherwise skipped. This is outside our control at the script level.

## Change

Extended `bc-replay/Patch-BcReplay.ps1` (already runs on `npm install` postinstall, `setup.ps1`, and `start.ps1`) to also patch `Commands.js`: `authenticateAadMfa` now only attempts TOTP/certificate entry when an MFA challenge is actually visible on the page. If Entra skips the challenge, the function falls through unchanged to the existing "Stay signed in?" handling instead of throwing.

The patch is idempotent (marker-based, like the existing startup patch) and matches the exact original source before replacing it, so an unexpected upstream bc-replay change fails loudly instead of silently corrupting the file.

## Verification

Ran `Patch-BcReplay.ps1` twice; first run applied both patches, second run reported both already applied. Manually inspected the patched `authenticateAadMfa` in `Commands.js` to confirm the guarded logic.

## Follow-up

If this keeps happening, check the affected account's Conditional Access / MFA registration in Entra ID (see [IT-Entra-ID-OTP-Policy-Configuration.md](../docs/IT-Entra-ID-OTP-Policy-Configuration.md)) — MFA being skipped entirely is a tenant/policy-side signal, not something bc-replay or this patch can control.
