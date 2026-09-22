# Proof

**Automatic pull request previews for Shopify Liquid themes.**

[Website](https://proof.billynoyes.co.uk/) · [Documentation](https://proof.billynoyes.co.uk/docs/) · [GitHub Marketplace](https://github.com/marketplace/actions/theme-proof)

Proof builds each pull request without store credentials, deploys the validated theme files as a Shopify development preview, and keeps one PR comment updated with storefront and Theme Editor links. Closing the PR removes the preview.

## Set up Proof

You need a Shopify store with the free [Theme Access app](https://apps.shopify.com/theme-access) and a theme repository on GitHub.

### 1. Add the GitHub environment

Create a repository environment named `theme-preview`, then add:

| Name                      | Type     | Value                                    |
| ------------------------- | -------- | ---------------------------------------- |
| `SHOPIFY_CLI_THEME_TOKEN` | Secret   | A dedicated Theme Access password        |
| `SHOPIFY_FLAG_STORE`      | Variable | Your full `example.myshopify.com` domain |

Never commit the Theme Access password. Delete it in Theme Access to revoke Proof's store access.

### 2. Add the workflow

Create `.github/workflows/theme-proof.yml`:

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
    uses: BillyNoyes/Proof/.github/workflows/preview.yml@v1.0.0
    with:
      environment: theme-preview
    secrets:
      SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
```

Use the reusable workflow above rather than putting build and deployment steps in one job. It keeps untrusted PR builds separate from Shopify credentials. Fork PRs are intentionally skipped.

### 3. Configure your build when needed

No configuration is required when a complete Shopify theme is at the repository root and needs no build, including Dawn.

For a project with a build step, add `theme-proof.config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/BillyNoyes/Proof/main/schema/theme-proof.schema.json",
  "version": 1,
  "build": {
    "workingDirectory": ".",
    "install": "npm ci",
    "command": "npm run build",
    "themeDirectory": "dist"
  }
}
```

`workingDirectory` and `themeDirectory` are relative to the repository root. The output must be a complete deployable theme, not only compiled assets. Optional `setup`, `install`, and `command` steps run in that order.

See the [full documentation](https://proof.billynoyes.co.uk/docs/) for nested projects, environment approvals, lifecycle behavior, troubleshooting, and security details.

## Safety model

- PR code runs in a read-only build job without Shopify credentials.
- The deployment job does not check out or execute repository scripts.
- Only Shopify theme directories are transferred, with file, size, path, and symlink validation.
- Proof creates development-context themes only. It does not target live or existing themes.
- Deployment and cleanup verify current PR and remote theme state before changing anything.
- Internal Actions and Shopify CLI are pinned to reviewed versions.

Private development-store lifecycle testing covered creation, updates, context reuse, comments, manual deletion and recreation, cleanup, stale runs, and cancellation. See [INTEGRATION.md](INTEGRATION.md) for the sanitized results and remaining limits.

## Support and development

- Read the [documentation](https://proof.billynoyes.co.uk/docs/).
- Open a [bug or feature request](https://github.com/BillyNoyes/Proof/issues/new/choose).
- Report security issues through [private vulnerability reporting](https://github.com/BillyNoyes/Proof/security/advisories/new).
- Read [CONTRIBUTING.md](CONTRIBUTING.md) to work on Proof.

Proof is MIT licensed and independently developed, with no Shopify sponsorship or endorsement.
