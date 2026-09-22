---
type: changelog
title: Show results after workflow runs
description: Returns the local test automation app to its Results screen when a workflow finishes.
tags:
  - results
  - workflow
  - usability
date: 2026-09-22
---

# Show results after workflow runs

## Changed

- The local app now automatically opens and refreshes the **Results** screen when a workflow completes.
- `Run-BCWorkflow.ps1` no longer opens `workflow-summary.html` in a separate browser window.
- The workflow HTML summary remains generated for offline and CI review.

## Validation

- `npm test` in `app/`: 7 passing tests.
- `node --check app/public/js/app.js` verifies the updated browser script syntax.

## Citations

1. [`/app/public/js/app.js`](../app/public/js/app.js) — workflow completion navigation.
2. [`/bc-replay/Run-BCWorkflow.ps1`](../bc-replay/Run-BCWorkflow.ps1) — workflow report artifact handling.