---
type: decision
title: Central versioned script library
description: Page scripts live in one library with stable IDs and immutable versions; workflows reference IDs and always run the latest version.
tags:
  - script-library
  - versioning
  - workflow
date: 2026-10-13
status: accepted
---

# Central versioned script library

## Decision

Store all page scripts in `page-scripting/script-library/`. Each script has a stable generated ID, a name, a folder, and immutable numbered versions (`v<N>.yml`, number + date). Workflow steps reference scripts by `scriptIds`. The runner always executes the latest version and records the version used in the results.

Scripts referenced by a workflow cannot be deleted. Duplicated process flows reuse the same scripts. Content is changed only by uploading a new version; there is no YAML editing in the app.

## Rationale

Per-workflow script copies caused duplication (`… 2.yml` files) and no traceability. Stable IDs make rename/move metadata-only, so workflows never break. Recording the executed version gives traceability without pinning overhead.

## Consequence

A new upload immediately affects every workflow that uses the script. Results show which version ran. Legacy path-based `script`/`scripts` fields are removed after migration.

## Citations

1. [`/Plans/20261013-Script Library.md`](../.archive/20261013-Script%20Library.md) — full specification.
