---
type: changelog
title: Rename environments
description: Allow existing environments to be renamed while preserving their credentials and default status.
date: 2026-09-03
tags:
  - environments
  - credentials
  - ui
---

# Rename environments

Environment names can now be changed from the edit dialog. Role credentials and app registration secrets are migrated to the new name, default status is preserved, and duplicate names are rejected.