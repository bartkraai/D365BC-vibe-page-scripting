# Changelog

## 2026-04-17

### Features

- **Workflow Builder** — Added ability to delete projects entirely from the project picker screen. Each project card now shows a trash icon; clicking it prompts for confirmation before removing the project folder and all its contents.

### Bug Fixes

- **Workflow Builder (iframe)** — Opening a new workflow no longer shows the previously loaded workflow. Added `clearWorkflowState()` call when `load-workflow` message has no workflow data.
- **Workflow Builder (export)** — Fixed script path being silently dropped on save/export. The `request-export` handler read `s.script` (undefined) instead of `s.scripts[0]` for single-script steps, causing the `script` property to vanish from `workflow.json` after every auto-save.
- **Workflow Runner** — Fixed all runs being reported as "failed" even when Playwright tests passed. `Invoke-Npx` returned an array (stdout lines + exit code) instead of just the exit code, causing `$exitCode -ne 0` to always evaluate true. Piped `cmd /c` output through `Write-Host` so only `$LASTEXITCODE` is returned.

### Files Changed

- `tools/workflow-builder/index.html` — clear state on empty workflow load; fix export script path; add project delete button and `deleteProject()` function
- `app/server.js` — add `DELETE /api/projects/:name` endpoint
- `bc-replay/Run-BCWorkflow.ps1` — fix `Invoke-Npx` return value

## 2026-04-16

### Bug Fixes

- **Workflow Builder** — Missing `script` on bc-replay steps promoted from warning to validation error. Save/Export now blocked until every step has a script assigned.
- **Workflow Builder** — Project names are now sanitized: trailing dots, spaces, and illegal path characters are stripped on creation. Prevents broken folder names on Windows.
- **Server (scaffold API)** — Added server-side validation to `/api/projects/scaffold`. Rejects workflows missing `bc_url`, `user`, or `script` with a 400 error, acting as a safety net if client-side validation is bypassed.
- **Server (scaffold API)** — Project name sanitization now strips trailing dots and spaces before creating folders.
- **Catalog Runner** — Fixed stale `$LASTEXITCODE` bug in `Run-CatalogWorkflows.ps1` that caused false "Catalog validation failed" errors when `Test-Catalog.ps1` actually passed.
- **Catalog** — Fixed `workflow_path` for "New Service Order" process flow; removed broken trailing-dot folder reference.

### Files Changed

- `tools/workflow-builder/index.html` — validation + name sanitization
- `app/server.js` — server-side validation + name sanitization
- `bc-replay/Run-CatalogWorkflows.ps1` — `$LASTEXITCODE` reset
- `page-scripting/catalog.json` — corrected workflow path
- `page-scripting/Open projectkaart/workflow.json` — added missing `script` property
