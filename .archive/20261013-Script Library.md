---
type: plan
title: Script Library
description: Central, versioned script library reused across workflows, with rename/move everywhere and hardening of existing functionality.
tags:
  - script-library
  - workflow-builder
  - catalog
  - hardening
date: 2026-10-13
status: complete
---

# Script Library

## Goal

Page scripts are managed independently from workflows in a central **Script Library**, reused across workflows, version-tracked and visible in the app. Everything (scripts, library folders, workflows, catalog levels) can be renamed and moved. Existing functionality is hardened.

## Decisions (user, 2026-10-13)

| # | Topic | Decision |
|---|---|---|
| 1 | Version at run time | Always **latest**. Actual version used is recorded in results. |
| 2 | Rename/move scope | **All**: library scripts, library folders, workflows, catalog Type / Value Chain / Process Flow. |
| 3 | Structure | `page-scripting/script-library/` + `page-scripting/workflows/`. |
| 4 | Editing | Upload only (new version). No YAML editing in app. |
| 5 | Version metadata | Number + date (+ hash, original filename internally). No author/notes/diff. |
| 6 | Migration | Migrate all existing scripts + workflows — **last phase**, after everything else works. |
| 7 | Delete referenced script | **Blocked** (409 + usage list). |
| 8 | Duplicate process flow | Reuses library scripts (no copies). |
| 9 | Variants generator | Unchanged. |
| 10 | Concurrency | Single user; no locking. Atomic writes only. |
| 11 | Branch | Stay on `feature/multi-user-workflow-plan`. |

## Target structure

```
page-scripting/
  catalog.json, catalog.schema.json
  Generate-BC-Script-Variants.ps1          (unchanged)
  script-library/
    library.json                           index: folders + scripts + versions
    scripts/<scriptId>/v<N>.yml            immutable version files
  workflows/
    <Workflow>/workflow.json, users*.json, app-registrations*.json, results/, Variants/
```

### `library.json`

```json
{
  "schemaVersion": 1,
  "folders": [{ "id": "f-…", "name": "Inkoop", "parentId": null }],
  "scripts": [{
    "id": "s-…", "name": "Projectregistratie", "description": "", "folderId": "f-…",
    "versions": [{ "version": 1, "createdAt": "ISO", "sha256": "…", "fileName": "Projectregistratie.yml" }]
  }]
}
```

- IDs: stable, generated (`crypto.randomUUID()` with `f-`/`s-` prefix). Rename/move changes metadata only.
- Names unique (case-insensitive) within the same parent folder, for folders and scripts.
- Folder moves reject cycles. Delete folder only when empty (409 otherwise).
- New version: content must parse as YAML; identical sha256 to latest → no new version (`unchanged: true`).
- Latest version = highest `version`.

### Workflow step reference

```json
{ "id": "step-2", "name": "…", "user": "…", "scriptIds": ["s-…"] }
```

- `scriptIds` (array, ≥1) is the single canonical form. Multi-script steps = multiple ids.
- Legacy `script` / `scripts` paths stay supported **only until migration**; migration phase removes legacy support (one path).

## API contract

Library (`app/script-library.js`, routes in `app/server.js`):

| Method | Route | Body | Result |
|---|---|---|---|
| GET | `/api/library` | – | `{ folders, scripts:[{id,name,description,folderId,latestVersion,updatedAt,usageCount}] }` |
| POST | `/api/library/folders` | `{name,parentId}` | folder |
| PATCH | `/api/library/folders/:id` | `{name?,parentId?}` | folder |
| DELETE | `/api/library/folders/:id` | – | 204 / 409 not empty |
| POST | `/api/library/scripts` | `{name,folderId,description?,fileName,content}` | script (v1) |
| GET | `/api/library/scripts/:id` | – | script + `versions[]` + `usage` |
| PATCH | `/api/library/scripts/:id` | `{name?,folderId?,description?}` | script |
| POST | `/api/library/scripts/:id/versions` | `{fileName,content}` | `{version,createdAt,unchanged}` |
| GET | `/api/library/scripts/:id/versions/:v/content` | `v` = number or `latest` | `text/yaml` |
| GET | `/api/library/scripts/:id/usage` | – | `[{workflow, steps:[{id,name}]}]` |
| DELETE | `/api/library/scripts/:id` | – | 204 / 409 `{error, usage}` |

Workflows / catalog:

| Method | Route | Purpose |
|---|---|---|
| PATCH | `/api/projects/:name` | `{newName}` → rename workflow folder, update catalog `workflow_path`. 409 if target exists or a run is active. |
| POST | `/api/catalog` | Now validated (structure, unique codes per level, `workflow_path` inside `workflows/`) + atomic write. |
| POST | `/api/projects/scaffold`, `/api/projects/:name/workflow` | Validate steps; `scriptIds` must exist in library. No script file writes. |

Errors: JSON `{ error }` with 400 (invalid input), 404, 409 (conflict/referenced), 500.

## Runner

- New param `-LibraryPath` (default `..\page-scripting\script-library` relative to `bc-replay`).
- Resolve each `scriptIds[i]` → latest `v<N>.yml`; validation fails fast for unknown id.
- `workflow-summary.json` per step/sub-result: `scriptId`, `scriptName`, `scriptVersion`, `scriptVersionDate` (keep `script` for display path).
- HTML report shows `name v<N>`.

## UI

- **Script Library tab** (main app, new nav item between Catalog and Test Flow Builder):
  folder tree + script list; create/rename/move/delete folder; upload new script; upload new version; rename/move (drag-and-drop + "Move to…" dialog for keyboard); delete (blocked with usage shown); version history (number, date) with view/download YAML; "Used by" list linking to workflows; search filter.
- **Catalog tab + builder catalog editor**: rename Type / Value Chain / Process Flow (existing inline edit), **move** Value Chain to another Type, **move** Process Flow to another Value Chain, **rename workflow folder**.
- **Test Flow Builder**: per step a library picker (search + tree) replaces script drop zone; selected scripts show `name · vN · date`; quick "upload to library" from picker; scaffold/save send `scriptIds` only.
- **Results + PDF**: show `script name vN` per step/sub-result.

## Hardening (existing functionality)

1. `app/paths.js`: one resolver for `page-scripting`, `workflows`, `script-library`, catalog; `resolveWorkflowDir(name)` rejects traversal/invalid names → used by every `:name` route, run, evaluate, seed, variants, results.
2. Results routes (`dir`, `id` params): resolve real path and ensure inside workflows root.
3. All JSON reads wrapped (invalid JSON → 400/500 JSON, never crash).
4. All JSON writes atomic (tmp + rename) via one helper.
5. Workflow validation shared by builder save + scaffold + runner pre-check: unique step ids, `depends_on` exists, user present, script refs exist.
6. Catalog validation on save (schema rules + unique codes).
7. Express error middleware + 404 for unknown `/api/*`.
8. Block workflow rename/delete while a run is active.
9. Unit tests for every new module and every hardened rule.

## Phases

| # | Phase | Owner | Status |
|---|---|---|---|
| 1 | Spec + decisions | Senior | done |
| 2 | Backend: `paths.js`, `script-library.js`, `workflow-store.js`, hardening, routes, tests | Builder A | done |
| 3 | Runner + report: `scriptIds`, `-LibraryPath`, version in summary/HTML/PDF | Builder A | done |
| 4 | UI: Script Library tab, catalog move/rename, results version | Builder B | done |
| 5 | Builder: library picker, `scriptIds`, rename workflow | Builder B | done |
| 6 | Review + fix loop | Reviewer → builders | done (round 1) |
| 7 | Migration: move workflows → `workflows/`, import scripts (dedupe by hash), rewrite `workflow.json` to `scriptIds`, update catalog paths, remove legacy path support | Builder A | done |
| 8 | Docs: README, workflow guides, schema, module index, changelog | Documentalist | done |

## Risks

- Builder file is 4.7k lines single HTML; changes must stay surgical.
- Migration completed with external backups; 13 workflows moved and 36 unique scripts imported. Six additional project-data folders without workflows were also preserved under `workflows/`.
- Results `relDir` paths change after move to `workflows/`; old results stay readable (they move with their folder).
- Migration changed the on-disk layout after a dry-run and created backups outside the repository. Missing script references were resolved from matching copies in complete workflow versions; review if those copies differed in business intent.
