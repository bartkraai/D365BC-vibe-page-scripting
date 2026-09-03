---
type: changelog
title: Prevent watcher crash on locked report media
description: Keep the local API available when generated Playwright media files are locked during startup or test execution.
date: 2026-09-03
tags:
  - reliability
  - file-watcher
  - environment-save
---

# Prevent watcher crash on locked report media

The application file watcher now ignores generated video files and logs watcher errors instead of terminating the Node.js server. Environment saves therefore continue to reach the API when Playwright report media is locked.