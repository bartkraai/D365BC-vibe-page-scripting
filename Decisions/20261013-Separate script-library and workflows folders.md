---
type: decision
title: Separate script-library and workflows folders
description: page-scripting is split into script-library and workflows roots, resolved through one path module.
tags:
  - structure
  - hardening
  - migration
date: 2026-10-13
status: accepted
---

# Separate script-library and workflows folders

## Decision

Use `page-scripting/script-library/` for scripts and `page-scripting/workflows/<Workflow>/` for workflow folders (workflow.json, users, results, variants). All server code resolves these through a single path module that rejects traversal and invalid names. Catalog `workflow_path` values point into `workflows/`.

Existing content is migrated in the final phase, with a backup and dry-run first.

## Rationale

A clear split separates reusable assets from workflow configuration and run output. One resolver replaces ~25 ad-hoc path joins and closes path-traversal gaps.

## Consequence

The catalog, results URLs, and runner paths change once during migration. The variants generator stays where it is.

## Citations

1. [`/Plans/20261013-Script Library.md`](../.archive/20261013-Script%20Library.md) — full specification.
