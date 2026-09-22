---
type: changelog
title: Replay video results
description: Adds conditional replay-video playback to workflow Results steps.
tags:
  - reporting
  - playwright
  - video
date: 2026-09-22
---

# Replay video results

## Changed

- Results steps now show **Watch recording** when a retained replay video exists.
- The recording opens in an in-page player with native controls, keyboard dismissal, and an **Open in new tab** fallback.
- Failed steps use an emphasized recording control to speed up failure investigation.
- Missing recordings remain hidden instead of showing a disabled or broken control.
- Hashed WebM/MP4 files stored in `playwright-report/data` are recognized as replay recordings.

## Safety and accessibility

- Video discovery resolves real filesystem paths and rejects directories outside `page-scripting`, including junction escapes.
- The player dialog has a step-specific accessible name, contains keyboard focus, and restores focus to its trigger when closed.

## Validation

- Added artifact tests for nested WebM, prefixed MP4, Playwright hashed media, absent/unreadable paths, and junction containment.
- `npm test` in `app/`: 13 passing tests.

## Citations

1. [`/app/result-artifacts.js`](../app/result-artifacts.js) — retained replay-video discovery and containment check.
2. [`/app/server.js`](../app/server.js) — conditional step video URL exposure.
3. [`/app/public/js/app.js`](../app/public/js/app.js) — recording control and overlay behavior.
