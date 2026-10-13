# Getting Started with BC Page Scripting

Automate Business Central testing in four steps.

## What You Need

- A Business Central Sandbox environment
- A BC test account with page scripting permissions
- PowerShell 7+, Git, Node.js 16.14+ (checked automatically by `setup.ps1` below)

## Step 1 — Run Setup

From the repo root, run:

```powershell
.\setup.ps1
```

This checks your environment, installs dependencies, and opens the **Workflow Builder** in your browser.

> If you prefer to check requirements manually, see the [bc-replay guide](BC-REPLAY-QUICK-START.md).

## Step 2 — Design Your Workflow (Workflow Builder)

Open [tools/workflow-builder/index.html](tools/workflow-builder/index.html) in any browser (no server needed).

1. Enter a **Workflow Name** and your **BC Environment URL**
2. Add **User Roles** (e.g. `purchaser`, `approver`)
3. Drop your recorded `.yml` scripts into the Script Library
4. Add steps, assign roles, and wire captures/injects
5. Click **Export** — follow the post-export instructions in the popup

> For single-user variant batch testing (no workflow needed), skip to Step 4.

## Step 3 — Configure Credentials

After exporting from the Workflow Builder:

1. Copy `users.sample.json` to `users.json` in your workflow folder
2. Fill in real values for each role:
   - `username` — BC account email
   - `password` — BC account password
   - `mfa_seed` — TOTP seed (only if MFA is enabled; remove otherwise)

> `users.json` is gitignored — never commit it.

## Step 4 — Record Scripts in BC

Open any BC page → **Settings → Page Scripting** → record your process and save as `.yml`. Upload the recording in the app's **Script Library** tab.

For workflows that capture values (e.g. PO number), add a `copy-value` step at the end of the recording.

See the [page scripting guide](PAGE-SCRIPTING-QUICK-START.md) for full recording instructions.

## Step 5 — Run

**Multi-user workflow:**
```powershell
cd bc-replay
.\Run-BCWorkflow.ps1 -WorkflowPath "..\page-scripting\workflows\Tenderproject"
```

**Single-user variant batch:** Use the app's **Variant Generator** tab to choose a Script Library entry, supply data, and generate variants in a workflow folder. The tab loads the latest script version automatically. The standalone PowerShell generator remains available for direct use; see the [page scripting guide](PAGE-SCRIPTING-QUICK-START.md).

## Repository Structure

- **`page-scripting/script-library/`** — Reusable page scripts and immutable versions.
- **`page-scripting/workflows/`** — Workflow definitions and run data.
- **`page-scripting/catalog.json`** — 3-level test hierarchy.
- **`bc-replay/`** — Workflow execution and reports.
- **`tools/workflow-builder/`** — Standalone visual workflow designer.
- **`docs/`** — User guides and operational documentation.
## Test Catalog

Workflows are organised into a 3-level hierarchy for traceability:

**Type** > **Value Chain** > **Process Flow**

Each level has a user-defined code and name. Composite codes (e.g. `PRJ-VG-TRAJECT`) are used in reports and filtering.

```powershell
# Validate catalog
cd bc-replay
.\Test-Catalog.ps1

# Run all workflows in a value chain
.\Run-CatalogWorkflows.ps1 -Filter "PRJ"

# Generate aggregate report
.\New-CatalogReport.ps1
# Open page-scripting/catalog-report.html to view the dashboard
```

The Workflow Builder includes a **Catalog** button (header) to view the full hierarchy and a **Catalog Position** section (sidebar) to assign workflows to their place in the hierarchy.

## Next Steps

- **[OVERVIEW.md](OVERVIEW.md)** - Visual walkthrough with screenshots
- **[PAGE-SCRIPTING-QUICK-START.md](PAGE-SCRIPTING-QUICK-START.md)** - BC recording guide
- **[BC-REPLAY-QUICK-START.md](BC-REPLAY-QUICK-START.md)** - Execution and MFA setup
- **[../SECURITY.md](../SECURITY.md)** - Security guidelines
- **[page-scripting/workflows/Tenderproject/](page-scripting/workflows/Tenderproject/)** - Working multi-user example

## Quick Troubleshooting

| Issue | Check |
|-------|-------|
| `setup.ps1` fails | Follow the fix hint printed next to each failed check |
| Script fails | Test data exists in BC? Account has permissions? |
| Workflow stops with validation errors | Read the error list — it tells you exactly what to fix |
| Variants not generated correctly | Check warnings from the generator — field captions may differ |