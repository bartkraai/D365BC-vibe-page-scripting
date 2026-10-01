---
type: changelog
title: Catalog editor reliability and value chain duplication
description: Preserves catalog edits and adds value-chain and process-flow duplication in both browser editors.
tags:
  - catalog
  - workflow-builder
  - usability
date: 2026-10-01
---

# Catalog editor reliability and duplication

## Changed

- Active Type, Value Chain, and Process Flow edits are committed before switching fields or saving the catalog.
- Editing a Process Flow in the main app no longer replaces its existing workflow folder path.
- Value Chains can be duplicated within their current Type.
- A duplicate includes all Process Flows and workflow paths, uses an editable `-COPY` code, and opens immediately for review.
- Process Flows can be duplicated within their current Value Chain together with their underlying project folder.
- Process Flow copies use an editable `-COPY` code, point to the new folder, and open immediately for review.
- The copied `workflow.json` receives the copied name and catalog position.

## Validation

- `npm test` in `app/`: 16 passing tests.
- Isolated Chromium checks cover edit switching, active-form saving, workflow-path preservation, and duplication in both catalog editors.

## Citations

1. [`/app/public/js/app.js`](../app/public/js/app.js) - main app catalog editing.
2. [`/tools/workflow-builder/index.html`](../tools/workflow-builder/index.html) - workflow builder catalog editor.
