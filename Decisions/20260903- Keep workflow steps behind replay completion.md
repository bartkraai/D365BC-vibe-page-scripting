---
type: decision
title: Keep workflow steps behind replay completion
description: Retains sequential replay completion instead of overlapping dependent steps with report finalization.
tags:
  - bc-replay
  - playwright
  - workflow
date: 2026-09-03
status: accepted
---

# Keep workflow steps behind replay completion

## Decision

Start each workflow step only after the preceding `bc-replay` process exits.

## Rationale

Playwright closes and saves video, then finalizes its HTML and JUnit reporters before the test process exits. The workflow orchestrator also reads captured values from finalized report data. Starting a dependent step earlier would require unsupported lifecycle hooks and introduce file and state races.

## Consequence

Video/report finalization is not overlapped with the next workflow step. Performance improvements should instead avoid redundant startup work or make video retention configurable.

## Citations

1. [`bc-replay/node_modules/@microsoft/bc-replay/player/dist/playwright.config.js`](../bc-replay/node_modules/@microsoft/bc-replay/player/dist/playwright.config.js) — video and reporter configuration.
2. [`bc-replay/Run-BCWorkflow.ps1`](../bc-replay/Run-BCWorkflow.ps1) — process completion and capture extraction order.