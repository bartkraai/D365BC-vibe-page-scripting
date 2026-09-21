---
type: changelog
title: Align latest bc-replay Playwright
description: Prevents an independently updated Playwright CLI from conflicting with the version bundled by bc-replay and removes repeated browser downloads during replay.
tags:
	- bc-replay
	- playwright
	- performance
date: 2026-09-21
---

# Align latest bc-replay Playwright

## Changed

- Removed the independent top-level Playwright dependency; bc-replay now owns the compatible Playwright version.
- Kept bc-replay, otplib, and qrcode on the `latest` channel.
- Hardened the postinstall patch to remove upstream browser installation commands, including future command variants.

## Result

Updating bc-replay cannot introduce a second incompatible Playwright runtime through this project.
Browsers are installed by repository setup/startup only when the local Playwright cache is missing.