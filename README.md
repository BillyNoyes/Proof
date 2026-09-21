# Proof

**Theme Proof — automatic pull request previews for Shopify Liquid themes.**

[Website](https://proof.billynoyes.co.uk/) · [Documentation](https://proof.billynoyes.co.uk/docs/)

Proof is an open-source GitHub Action that builds a theme for each pull request, deploys it as a Shopify preview, and maintains one comment with the latest storefront and Theme Editor links.

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

## Preview workflow

1. Build pull request code without Shopify credentials.
2. validate the resulting theme artifact.
3. Deploy it with Shopify CLI and a Theme Access credential.
4. Reuse a stable development context for subsequent commits.
5. Create or update one pull request comment with preview links and checks.
6. Delete the preview when the pull request closes.

Proof will use Shopify-supported primitives including Theme Access credentials, `shopify theme push --development --development-context`, machine-readable `--json` output, strict Theme Check validation, and non-interactive theme deletion.

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

## Theme Access setup

1. Install Shopify's free [Theme Access app](https://apps.shopify.com/theme-access) on the preview store.
2. Create a dedicated password for Proof and view the emailed password once.
3. In the GitHub repository, open **Settings → Environments** and create an environment named `theme-preview`.
4. Add an Environment secret named `SHOPIFY_CLI_THEME_TOKEN` containing the Theme Access password.
5. Add an Environment variable named `SHOPIFY_FLAG_STORE` containing the full store domain, such as `example.myshopify.com`.

The same setup can be performed with GitHub CLI. The secret command prompts securely for the value:

```sh
gh secret set --env theme-preview SHOPIFY_CLI_THEME_TOKEN
gh variable set --env theme-preview SHOPIFY_FLAG_STORE --body example.myshopify.com
```

The reusable workflow reads the secret and variable only in its privileged deployment and cleanup jobs. The untrusted build job does not receive the environment. Keep the password environment-scoped and include the named `secrets` mapping shown below to authorize access from the called workflow; do not use broad `secrets: inherit`.

For development-store experiments, add this caller workflow. `@main` is not a stable release; use a reviewed commit SHA when validating a release candidate. See [RELEASING.md](RELEASING.md) for the required store-backed checks and Marketplace publication steps.

```yaml
name: Theme Proof

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: read
  pull-requests: write

jobs:
  preview:
    if: github.event.pull_request.head.repo.full_name == github.repository
    uses: BillyNoyes/Proof/.github/workflows/preview.yml@main
    with:
      config: theme-proof.config.json
      environment: theme-preview
    secrets:
      SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
```

Fork pull requests do not receive the Environment secret and therefore do not deploy automatically. Delete the password in the Theme Access app to revoke Proof's store access, then remove or replace the GitHub Environment secret.

## Security model

Untrusted pull request code must never run with Shopify credentials. Proof will separate builds from deployment:

- The build job has only `contents: read`, no Shopify environment, and checks out the PR head SHA before producing an artifact.
- The deployment job does not execute repository scripts. It accepts only validated theme files and holds the Theme Access credential.
- Fork pull requests do not deploy automatically.
- Live themes are never valid preview targets. Cleanup verifies the current role and context before deleting and confirms that the theme is gone.
- Deployment and cleanup are serialized without canceling a running mutation. Current PR state is checked to skip stale deploys and cleanup for reopened PRs.
- Inherited Shopify CLI flags are removed so they cannot enable publishing or change the target.

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

This is not a stable release yet. Private development-store lifecycle testing has passed; see the sanitized [integration report](INTEGRATION.md) for coverage and limits. Authenticated storefront and Theme Editor interactions were not exercised. See [REVIEW.md](REVIEW.md) for review results and [RELEASING.md](RELEASING.md) for Marketplace publication steps. Cross-platform tests cover the code and build Action; the supported deployment workflow uses GitHub-hosted Ubuntu with Node.js 24 and Shopify CLI 4.8.0.

## Scope

The first release will provide a reusable GitHub Actions workflow and deployment action. A hosted GitHub App may follow after the workflow and security model are proven.

Proof is independently developed and has no Shopify sponsorship or endorsement.

See [PLAN.md](PLAN.md) for the proposed architecture, constraints, milestones, and validation plan. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and report suspected vulnerabilities through the [security policy](SECURITY.md).

## Website development

The GitHub Pages site lives in [`site/`](site/README.md) and uses Vite, Tailwind CSS, and Alpine.js. Run `pnpm dev:site` to develop it or `pnpm test:site` to check and build both pages. See the site README for browser tests and deployment setup.

## License

MIT
