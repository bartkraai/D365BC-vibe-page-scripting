---
type: decision
title: Migrate credentials when renaming environments
description: Environment renames migrate name-keyed credentials instead of changing only display metadata.
date: 2026-09-03
status: accepted
tags:
  - environments
  - credentials
---

# Migrate credentials when renaming environments

## Context

Environment names are part of the account keys used by Windows Credential Manager and the DPAPI fallback. Renaming only the metadata would make stored credentials unreachable.

## Decision

When an existing environment is renamed, copy its role and app-registration secrets to accounts using the new name, persist the renamed metadata, then remove the old accounts. Duplicate target names are rejected.

## Consequences

Existing credentials continue to work after a rename, and the old name does not leave orphaned credential entries. The rename is handled through the existing save flow so URL, roles, companies, and registration settings can be updated together.