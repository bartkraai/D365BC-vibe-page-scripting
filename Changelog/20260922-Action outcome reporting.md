---
type: changelog
title: Action outcome reporting
description: Adds per-action replay outcomes and recorded failure reasons to workflow reports.
tags:
  - reporting
  - playwright
  - results
date: 2026-09-22
---

# Action outcome reporting

## Changed

- The expanded Results view now shows **Passed**, **Failed**, or **Not recorded** for every replay action.
- Failed actions show their recorded replay error message inline.
- Downloaded workflow PDFs include the same action outcomes and failure messages.

## Validation

- Added parser tests for passed, failed, and unrecorded actions.
- Added regression coverage for replay logs whose first action was not recorded.
- `npm test` in `app/`: 7 passing tests.

## Citations

1. [`/app/action-outcomes.js`](../app/action-outcomes.js) — shared replay-log outcome parser.
2. [`/app/server.js`](../app/server.js) — Results API and PDF integration.
3. [`/app/public/js/app.js`](../app/public/js/app.js) — expanded Results action table.
