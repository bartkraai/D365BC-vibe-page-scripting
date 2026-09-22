---
type: decision
title: Shared action outcome parsing
description: Uses one replay-log parser for the Results API and PDF report.
tags:
  - reporting
  - playwright
  - pdf
date: 2026-09-22
status: accepted
---

# Shared action outcome parsing

## Decision

Use `app/action-outcomes.js` as the sole mapping from Playwright replay logs to per-action outcomes for both the web Results report and downloaded PDFs.

## Rationale

Replay logs record an error per action but do not provide an explicit success flag. A single mapping keeps the two report formats consistent:

- `log.error` means **Failed**.
- A recorded log without an error means **Passed**.
- No recorded log means **Not recorded**; it must not be inferred as success.

## Consequence

Both report formats show the same outcome and failure message. A malformed action-log file omits only the PDF action appendix for that workflow step, allowing the main PDF to remain downloadable.

## Citations

1. [`/app/action-outcomes.js`](../app/action-outcomes.js) — outcome mapping and report-data reader.
2. [`/app/server.js`](../app/server.js) — API and PDF consumers.
3. [`/app/action-outcomes.test.js`](../app/action-outcomes.test.js) — mapping regression coverage.
