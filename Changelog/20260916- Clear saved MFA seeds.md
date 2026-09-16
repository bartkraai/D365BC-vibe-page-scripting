# Clear saved MFA seeds

## Context

Clearing an environment role's MFA seed only changed visible metadata. The previous seed remained in Windows Credential Manager or the DPAPI fallback store, so later workflow runs still enabled TOTP authentication.

## Change

Environment saves now synchronize optional MFA credentials: a nonblank seed is stored, while an empty, whitespace, or missing seed deletes the secure credential. Project credential seeding uses the same behavior, and `hasMfa` metadata is derived from the synchronization result.

## Verification

The app test suite covers saving a seed and deleting empty, whitespace, and missing seed values. All four tests and JavaScript syntax checks pass.