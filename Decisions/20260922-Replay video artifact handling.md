---
type: decision
title: Replay video artifact handling
description: Presents retained step replay videos in the Results screen only after trusted artifact discovery.
tags:
  - playwright
  - reporting
  - security
  - accessibility
date: 2026-09-22
status: accepted
---

# Replay video artifact handling

## Decision

Expose replay videos as a conditional, step-level **Watch recording** control in Results. Play videos in an in-page overlay and retain a new-tab fallback.

## Rationale

One Playwright recording covers a workflow step rather than a single page-script action. A step-level control preserves the action table’s scanability and keeps the evidence next to the matching step status.

The artifact locator resolves real paths and only allows videos inside `page-scripting`. This prevents a malformed workflow summary from scanning or serving content outside the repository’s result root.

## Consequence

The control is absent when no recording was retained. Local replay runs retain videos; CI runs may retain only failed-run videos according to the installed `bc-replay` Playwright configuration.

## Citations

1. [`/app/result-artifacts.js`](../app/result-artifacts.js) — trusted artifact discovery.
2. [`/app/public/index.html`](../app/public/index.html) — accessible video overlay structure.
3. [`/bc-replay/node_modules/@microsoft/bc-replay/player/dist/playwright.config.js`](../bc-replay/node_modules/@microsoft/bc-replay/player/dist/playwright.config.js) — replay video retention configuration.
