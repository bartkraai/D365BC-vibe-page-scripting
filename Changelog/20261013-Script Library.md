---
type: changelog
title: Script Library and workflow migration
description: Central reusable script library, numbered versions, workflow migration, and workflow-path hardening.
tags:
  - script-library
  - migration
  - hardening
date: 2026-10-13
---

# Script Library and workflow migration

## Status

Complete. See the [archived plan](../.archive/20261013-Script%20Library.md).

## Changed

- Added a central Script Library with stable IDs, folders, immutable numbered YAML versions, hashes, usage lookup, and deletion protection for referenced scripts.
- Added the **Script Library** tab for upload, new versions, version history, view/download, rename, move, usage, and folder management.
- Updated workflows and the runner to use `scriptIds`, always execute the latest version, and record the exact script version and date in results.
- Updated the workflow builder, variants UI, catalog workflow paths, result views, catalog PowerShell validation/runner/report tools, and documentation for the library/workflows split.
- Migrated all 19 legacy project folders to `page-scripting/workflows/`; 13 contain workflows. Imported 36 unique scripts and deduplicated exact-content copies.
- Preserved results and other project files. Created external backups before migration.
- Added a dry-run-capable migration utility and tests, transient Windows atomic-write retry, and transactional workflow rename behavior.
- Removed legacy path-based execution and workflow save validation. Updated catalog schema and module index.

## Validation

- Migration dry-run reports no remaining legacy folders after migration.
- Workflow scan confirms all 81 steps use valid script IDs; no legacy `script`/`scripts` fields remain.
- `cd app; npm test` — all tests pass.
- Node syntax checks, PowerShell parser checks, catalog validation, app HTTP/API smoke checks, and `git diff --check` completed.

## Migration note

When missing local script references had multiple candidates, matching copies were selected from the complete corresponding workflow version. Review those workflows if the source files had different business intent.