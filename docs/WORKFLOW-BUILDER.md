# BC Workflow Builder

The Workflow Builder connects reusable page scripts into a workflow. Scripts are managed independently in the **Script Library** tab and can be reused across workflows.

## Current storage model

- `page-scripting/script-library/library.json` indexes folders, scripts, and versions.
- Script content is immutable and stored as `script-library/scripts/<scriptId>/v<N>.yml`.
- `page-scripting/workflows/<Workflow>/workflow.json` stores steps, dependencies, users, and capture/inject rules.
- Workflow steps reference script IDs. Every run uses the latest library version and records the script name, version number, and date in the results.

## How to use

1. Open the app from `start.ps1`.
2. Open **Script Library** and upload each recorded `.yml` file. Uploading revised content adds a numbered version; YAML is not edited in the app.
3. Open **Test Flow Builder**, add workflow steps, select a user role, and choose one or more scripts from the library.
4. Configure dependencies, captures, and injections. The builder reads the selected script content to suggest parameters and captures.
5. Save the workflow. Its folder and workflow definition are stored under `page-scripting/workflows/`.
6. Run it from the Run tab or with `bc-replay/Run-BCWorkflow.ps1`.

## Workflow format

Each replay step uses `scriptIds` (ordered for multi-script steps):

```json
{
  "id": "create-po",
  "name": "Create purchase order",
  "user": "purchaser",
  "scriptIds": ["s-<stable-script-id>"],
  "capture": { "order_no": "Purchase Order No." }
}
```

The library ID remains stable when a script is renamed or moved. A workflow automatically runs the latest version. Results include the exact version used so an older run remains traceable.

## Workflow files

A workflow folder can contain:

- `workflow.json` — step definitions and library references
- `users.sample.json` — role template (copy/configure through the app; do not commit credentials)
- `app-registrations.sample.json` — optional BC API step configuration
- `results/` — generated run reports
- `Variants/` — generated scripts from the existing variant generator

The catalog is in `page-scripting/catalog.json`; `workflow_path` values are relative to `page-scripting/workflows/`.