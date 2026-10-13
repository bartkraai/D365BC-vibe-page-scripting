# BC-Replay Test Runner

Execute Business Central page scripting YAML files in automated pipelines using Playwright.

## 🚀 Quick Start

### Quick Start

```powershell
# Install bc-replay
npm install @microsoft/bc-replay --save

# Run your scripts
npx replay .\recordings\*.yml -StartAddress https://your-bc-url

# View results
npx playwright show-report
```

### Complete Guide

📖 **[BC-REPLAY-QUICK-START.md](../docs/BC-REPLAY-QUICK-START.md)** - Full setup, authentication options, troubleshooting

---

## Multi-User Workflow Orchestrator

The orchestrator runs workflow steps sequentially with per-role credentials, passing captured values between steps. Workflow steps reference reusable Script Library entries by stable ID; each run automatically resolves the latest numbered version and records the version used.

### Quick Start

1. Upload BC-recorded YAML in the app's **Script Library** tab.
2. Build a workflow in **Test Flow Builder**, selecting one or more library scripts per step.
3. Configure the workflow's `users.json` credentials locally (never commit this file).
4. Run the workflow:

```powershell
cd bc-replay
.\Run-BCWorkflow.ps1 -WorkflowPath "..\page-scripting\workflows\Tenderproject"
```

### Workflow script references

Every step uses `scriptIds`, an ordered array of stable library IDs:

```json
{
  "id": "create-po",
  "name": "Create purchase order",
  "user": "purchaser",
  "scriptIds": ["s-<stable-script-id>"],
  "capture": { "po_number": "Purchase Order - No." }
}
```

For multiple scripts in one step, include multiple IDs in `scriptIds`. The UI shows script names and version dates; run reports record the exact version selected at execution time.

The orchestrator reads `workflow.json`, switches credentials from `users.json`, handles BC `copy-value` captures and native `parameters:` injection, and generates per-step Playwright reports plus an HTML/JSON workflow summary.

📖 See the [Tenderproject workflow](../page-scripting/workflows/Tenderproject/) for a migrated example. See the [Workflow Builder guide](../docs/WORKFLOW-BUILDER.md) for the current storage format.

---

## 🔐 MFA Support (Native TOTP)

bc-replay natively supports TOTP-based MFA via built-in parameters - no patches or workarounds needed.

```powershell
$env:BC_USERNAME = "testuser@yourtenant.onmicrosoft.com"
$env:BC_PASSWORD  = "YourPassword123"
$env:BC_MFA_SEED  = "YOUR_TOTP_SEED"

npx replay .\recordings\*.yml `
  -StartAddress https://businesscentral.dynamics.com/tenant/environment `
  -Authentication AAD `
  -UserNameKey BC_USERNAME `
  -PasswordKey BC_PASSWORD `
  -MultiFactorType TOTP `
  -MultiFactorSecretKey BC_MFA_SEED
```

**Requires a TOTP seed** captured once during account MFA setup. See the [bc-replay MFA section](../docs/BC-REPLAY-QUICK-START.md#-mfa-support-native-totp) for the full setup guide.

---

## 📚 Documentation

| Guide | Purpose |
|-------|---------|
| **[BC-REPLAY-QUICK-START.md](../docs/BC-REPLAY-QUICK-START.md)** | Standard bc-replay usage and MFA setup |
| **[bc-replay-capture-solution/](bc-replay-capture-solution/)** | Value capture (superseded by native `copy-value`) |
| **[MULTI-USER-WORKFLOW-PLAN.md](../docs/MULTI-USER-WORKFLOW-PLAN.md)** | Workflow architecture and plan |

---

## 🆘 Need Help?

**Standard bc-replay:** See the [bc-replay guide](../docs/BC-REPLAY-QUICK-START.md) troubleshooting section

**MFA setup:** See the [MFA section in the bc-replay guide](../docs/BC-REPLAY-QUICK-START.md#-mfa-support-native-totp)

**Resources:**
- [BC-Replay npm Package](https://www.npmjs.com/package/@microsoft/bc-replay)
- [Playwright Documentation](https://playwright.dev/)
- [BC Page Scripting Overview](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/developer/devenv-page-scripting)

---

## What's in This Folder

```
bc-replay/
├── Run-BCWorkflow.ps1           # Multi-user workflow orchestrator
├── Invoke-YamlPreprocess.ps1    # YAML parameter preprocessor (updates BC native defaults)
├── New-WorkflowReport.ps1       # Workflow summary report generator
├── bc-replay-capture-solution/  # Value capture (superseded by native copy-value)
├── README.md                    # This file
└── setup-local-env.ps1.template # Credential template
```

**Example scripts:**
- `*.yml` - Example scripts

---

**Ready to automate BC testing?** Start with the [bc-replay guide](../docs/BC-REPLAY-QUICK-START.md).
