# Normalize false replay failures

## Context

Some successful BC replays returned exit code `1` after writing a JUnit result with zero failures and errors. The workflow runner used the process exit code alone, so the summary incorrectly reported `FAILED`.

## Change

`Run-BCWorkflow.ps1` now treats a non-zero replay exit as passed only when `results.xml` exists, contains at least one test, and reports zero failures and errors. Genuine replay failures remain failed.

## Verification

The reported run's `results.xml` contains `tests=1`, `failures=0`, and `errors=0`, matching a successful test outcome.