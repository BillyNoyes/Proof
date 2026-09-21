# Proof

**Theme Proof — automatic pull request previews for Shopify Liquid themes.**

Proof is a planned open-source GitHub integration that builds a theme for each pull request, deploys it as a Shopify preview, and maintains one comment with the latest storefront and Theme Editor links.

> **Status:** early implementation. The deployment core and project configuration are under active development; no stable GitHub Action, app, or npm package has been published yet.

## Product identity

| Surface                 | Name               |
| ----------------------- | ------------------ |
| Product                 | Proof              |
| Long name               | Theme Proof        |
| GitHub repository       | `BillyNoyes/Proof` |
| Planned package and CLI | `theme-proof`      |
| Planned action name     | Theme Proof        |

GitHub Action references always include the repository owner. A future release would therefore be referenced from `BillyNoyes/Proof`, while the package and CLI remain unscoped as `theme-proof`.

## Proposed workflow

1. Build pull request code without Shopify credentials.
2. validate the resulting theme artifact.
3. Deploy it with Shopify CLI and a Theme Access credential.
4. Reuse a stable development context for subsequent commits.
5. Create or update one pull request comment with preview links and checks.
6. Delete the preview when the pull request closes.

Proof will use Shopify-supported primitives including Theme Access credentials, `shopify theme push --development-context`, machine-readable `--json` output, strict Theme Check validation, and non-interactive theme deletion.

## Project configuration

A static JSON file controls only the untrusted build job:

```json
{
  "$schema": "https://raw.githubusercontent.com/BillyNoyes/Proof/main/schema/theme-proof.schema.json",
  "version": 1,
  "build": {
    "workingDirectory": ".",
    "setup": "npm install --global pnpm@10.28.0",
    "install": "pnpm install --frozen-lockfile",
    "command": "pnpm build",
    "themeDirectory": "."
  }
}
```

`workingDirectory` and `themeDirectory` are relative to the repository root. `setup` can install a project-specific package manager or toolchain before dependency installation. Omit `setup`, `install`, and `command` for a standard theme such as Dawn that is already deployable without a build. Monorepos can point both directories at a nested theme.

Preview targeting is intentionally not controlled by pull request configuration. A pull request must not be able to redirect a privileged deployment to an existing or live theme. The safe default is a per-PR development context. Future existing-theme or unpublished-theme modes must be configured through trusted workflow or GitHub Environment settings and must verify that the target is not live.

## Security model

Untrusted pull request code must never run with Shopify credentials. Proof will separate builds from deployment:

- The build job has no Shopify secret and produces an artifact.
- The deployment job does not execute repository scripts. It accepts only validated theme files and holds the Theme Access credential.
- Fork pull requests do not deploy automatically.
- Live themes are never valid preview targets.

## Current implementation

The repository now contains an early TypeScript implementation of:

- static JSON project configuration with JSON Schema;
- optional setup, install, and build commands in the untrusted build action;
- no-build support for standard themes;
- clean staging of only Shopify theme directories;
- artifact path, symlink, file-count, and size validation;
- Theme Access credentials passed through environment variables rather than process arguments;
- Shopify CLI version checks, development-context pushes, strict validation, and JSON parsing;
- pull request comment state, updates, and cleanup;
- a reusable workflow with separate build, deployment, and cleanup jobs.

This is not a stable release yet. The next required milestone is a store-backed integration test on a dedicated development store, followed by replacing `@main` references with immutable release tags.

## Scope

The first release will provide a reusable GitHub Actions workflow and deployment action. A hosted GitHub App may follow after the workflow and security model are proven.

Proof is independently developed and has no Shopify sponsorship or endorsement.

See [PLAN.md](PLAN.md) for the proposed architecture, constraints, milestones, and validation plan. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and report suspected vulnerabilities through the [security policy](SECURITY.md).

## License

MIT
