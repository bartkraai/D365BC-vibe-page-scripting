---
type: changelog
title: Script Library
description: Central versioned script library, rename/move everywhere, and hardening of existing functionality.
tags:
  - script-library
  - catalog
  - hardening
date: 2026-10-13
---

# Script Library

## Status

In progress. See [plan](../Plans/20261013-Script%20Library.md).

## Changed

- Spec and decisions recorded.
- Script Library backend: folders, scripts, immutable numbered versions (sha256 dedupe, YAML validation, atomic writes), usage lookup, delete blocked when referenced.
- Workflow steps reference library scripts via `scriptIds`; runner always runs the latest version and records `scriptId`, `scriptName`, `scriptVersion`, `scriptVersionDate` in results (HTML, PDF, Results tab).
- New **Script Library** tab: folder tree, upload, new version, rename, move (drag-and-drop + keyboard), delete, version history, view/download, "Used by".
- Test Flow Builder: library script picker replaces per-workflow upload; duplicated flows reuse scripts.
- Catalog: move Value Chains and Process Flows; rename workflow folders (catalog paths updated).
- Hardening: single path resolver with traversal checks, typed HTTP errors (400/404/409), JSON 404 for unknown API routes, catalog and workflow validation on save, rename/delete blocked during active runs, atomic JSON writes.

## Validation

- `cd app; npm test` — unit + HTTP integration tests.
- PowerShell parser check on runner and report scripts.

## Pending

- Migration of existing workflows and scripts to `workflows/` + `script-library/` (until then the app lists no workflows).
- Documentation updates.
