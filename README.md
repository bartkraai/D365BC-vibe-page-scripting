# Business Central Page Scripting Project

Automate Business Central page testing using YAML-based scripts executed via Playwright. Record once, generate variants, test multiple combinations.

## ✨ Key Features

- 🔄 **Variant generation** - Automatically create test combinations from data files
- **Multi-user workflows** - Orchestrate sequential steps across different user roles with state passing
- 🔐 **Native MFA support** - Run bc-replay against accounts with MFA enabled using `-MultiFactorType TOTP`
- 🤖 **AI-assisted development** - A methodology for AI script generation

## 🚀 Quick Start

1. **Setup** — Run `.\setup.ps1` from the repo root to check prerequisites and open the Workflow Builder
2. **Record scripts** — Record YAML scripts in Business Central, then upload them in the app's Script Library tab
3. **Design your workflow** — Select reusable library scripts in the Workflow Builder and save to a workflow folder
4. **Run** — See [the bc-replay guide](docs/BC-REPLAY-QUICK-START.md) for execution options
5. **Examples** — Study `page-scripting/workflows/Tenderproject/` and `page-scripting/workflows/Termijnschema/`
6. **Full Guide** — [Getting started](docs/GETTING_STARTED.md)

## Project Structure

- **`page-scripting/script-library/`** — Reusable YAML scripts with immutable numbered versions.
- **`page-scripting/workflows/`** — Workflow definitions, user configuration, results, and generated variants.
- **`page-scripting/Generate-BC-Script-Variants.ps1`** — Existing PowerShell variant generator.
- **`page-scripting/catalog.json`** — 3-level test hierarchy (Type > Value Chain > Process Flow).
- [Page scripting quick start](docs/PAGE-SCRIPTING-QUICK-START.md) — Recording guide.

**`bc-replay/`** — Test execution, multi-user orchestration, and reporting.
- [BC-replay quick start](docs/BC-REPLAY-QUICK-START.md) — Execution guide.
- [Workflow Builder guide](docs/WORKFLOW-BUILDER.md) — Script Library and workflow format.

**`tools/`** — Visual tools and workflow builder.

**`docs/`** — Architecture and user guides.

## 👥 Multi-User Workflows

Orchestrate BC processes that span multiple users - for example, a purchaser creates a PO, then an approver approves it:

```powershell
# Credentials are stored in users.json per role
# Run the workflow
cd bc-replay
.\Run-BCWorkflow.ps1 -WorkflowPath "..\page-scripting\workflows\Tenderproject"
```

Each step runs with its own credentials. Captured values (like a PO number) are automatically injected into the next step's native BC `parameters:` section.

**See [page-scripting/workflows/Tenderproject/](page-scripting/workflows/Tenderproject/) for a working example.**

## Test Catalog — 3-Level Hierarchy

Organise workflows into a traceable hierarchy with user-defined codes and names:

| Level | Name | Example Code | Example Name |
|-------|------|-------------|-------------|
| 1 | Type | `PRJ` | Projecten |
| 2 | Value Chain | `VG` | Vastgoed |
| 3 | Process Flow | `TRAJECT` | Van traject naar project |

**Composite code:** `PRJ-VG-TRAJECT` — used in reports and filtering.

```powershell
# Validate catalog structure
cd bc-replay
.\Test-Catalog.ps1

# Run all workflows under a value chain
.\Run-CatalogWorkflows.ps1 -Filter "PRJ"

# Run a specific type
.\Run-CatalogWorkflows.ps1 -Filter "INK-PO"

# Generate aggregate dashboard
.\New-CatalogReport.ps1
```

The catalog is defined in [page-scripting/catalog.json](page-scripting/catalog.json). Its workflow paths are relative to `page-scripting/workflows/`. Workflow steps refer to shared library scripts by ID and always run the latest version.

##  Security

**Before using:**
- Replace placeholder credentials in test scripts
- Update BC URLs with your tenant/environment
- Never commit actual passwords to the repository

📖 **See [SECURITY.md](SECURITY.md) for complete security guidelines and TOTP account setup**

## Documentation

| Guide | Purpose |
|-------|---------|
| **[docs/README.md](docs/README.md)** | Documentation index |
| **[docs/OVERVIEW.md](docs/OVERVIEW.md)** | Visual overview — start here |
| **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** | Step-by-step setup walkthrough |
| **[tools/workflow-builder/index.html](tools/workflow-builder/index.html)** | Visual Workflow Builder (open in browser) |
| **[SECURITY.md](SECURITY.md)** | Security guidelines and TOTP account setup |
| **[page-scripting/script-library/](page-scripting/script-library/)** | Reusable, versioned recording scripts |
| **[page-scripting/workflows/](page-scripting/workflows/)** | Workflow definitions and run data |
| **[bc-replay/](bc-replay/)** | Execution and multi-user workflows |
| **[.github/copilot-instructions.md](.github/copilot-instructions.md)** | AI agent instructions and YAML patterns |

## 🔗 Resources

- [BC Page Scripting Docs](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/developer/devenv-page-scripting) - Official Microsoft documentation
- [BC-Replay Package](https://www.npmjs.com/package/@microsoft/bc-replay) - npm package for pipeline execution  
- [Playwright](https://playwright.dev/) - Underlying test automation framework
- [Blog: AI-Driven Page Scripting](https://blog.wingate365.com/2025/10/south-coast-summit-2025-ai-driven-page.html) - Methodology deep dive

---

> ⚠️ **Disclaimer:** This project is created for demonstration and research purposes only. Use at your own risk.
