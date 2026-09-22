# Documentation

This folder contains the maintained guides for the Business Central page-scripting project.

## Start here

- [Getting started](GETTING_STARTED.md) — install prerequisites, build a workflow, configure credentials, and run tests.
- [Solution overview](OVERVIEW.md) — understand the record, generate, replay, and report flow.

## Guides

| Guide | Use it when you need to… |
|---|---|
| [Page scripting quick start](PAGE-SCRIPTING-QUICK-START.md) | Record, parameterize, and replay a Business Central page script. |
| [BC-replay quick start](BC-REPLAY-QUICK-START.md) | Run scripts locally or in CI/CD, configure authentication, MFA, and results. |
| [Workflow Builder](WORKFLOW-BUILDER.md) | Create `workflow.json` and `users.sample.json` without hand-editing JSON. |
| [Multi-user workflow plan](MULTI-USER-WORKFLOW-PLAN.md) | Review workflow architecture and implementation details. |
| [BC testing process](BC-Testing-Process.md) | Understand the project’s broader testing process. |
| [Azure DevOps pipeline report](Azure-DevOps-Pipeline-Report.md) | Review pipeline reporting and integration behavior. |
| [MFA / OTP setup](MFA%20-%20OTP%20Setup%20Guide.md) | Set up TOTP for test accounts. |
| [Entra ID OTP policy configuration](IT-Entra-ID-OTP-Policy-Configuration.md) | Configure the tenant policy required for software OATH tokens. |

## Reference and research

- [IBIS calculation mock research](IBIS-Calculation-Mock-Research.md)
- [Image assets](images/README.md)
- [Security guidelines](../SECURITY.md)
- [Changelog](../CHANGELOG.md)
- [Feature changelog entries](../Changelog/)
- [Architecture decisions](../Decisions/)

## Documentation conventions

- Keep user-facing guides in `docs/`.
- Keep `README.md` and `SECURITY.md` at the repository root for discoverability.
- Keep component `README.md` files beside the component when they are useful as local entry points.
- Keep generated reports, archived experiments, and test artifacts out of the maintained guide set.
- Use relative links and validate them after moving files.

> **Disclaimer:** This project is for demonstration and research purposes only. Use it at your own risk.