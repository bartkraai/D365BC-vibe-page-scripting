---
type: changelog
title: Reduce replay startup delay
description: Removes a redundant browser installation check from every BC replay invocation.
tags:
	- bc-replay
	- performance
	- playwright
date: 2026-09-03
---

# Reduce replay startup delay

## Changed

- Removed the redundant Playwright browser installation check from each `bc-replay` invocation.
- Added a reproducible package patch that is reapplied after dependency installation.

## Result

Playwright Chromium remains installed during repository setup/startup, while workflow steps can begin without repeating the browser installation check.

The removed check measured approximately 2 seconds per replay on Windows. A seven-step workflow avoids approximately 14 seconds of repeated checks.

## Notes

Workflow steps remain sequential. Playwright finalizes video and reporters before returning control, and dependent steps may require captured report data.
