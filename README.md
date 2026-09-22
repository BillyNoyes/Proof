# Proof

**Automatic pull request previews for Shopify Liquid themes.**

[Website](https://proof.billynoyes.co.uk/) · [Documentation](https://proof.billynoyes.co.uk/docs/) · [GitHub Marketplace](https://github.com/marketplace/actions/theme-proof)

Proof builds each pull request, deploys it as a Shopify development preview, and adds the storefront and Theme Editor links to the PR. Closing the PR removes the preview.

## Get started

### 1. Create a Theme Access password

Install Shopify’s free [Theme Access app](https://apps.shopify.com/theme-access) on your preview store and create a dedicated password for Proof.

### 2. Add two GitHub environment values

In your theme repository, open **Settings → Environments** and create an environment named `theme-preview`.

| Name                      | Type     | Value                                    |
| ------------------------- | -------- | ---------------------------------------- |
| `SHOPIFY_CLI_THEME_TOKEN` | Secret   | The Theme Access password                |
| `SHOPIFY_FLAG_STORE`      | Variable | Your full `example.myshopify.com` domain |

### 3. Add the workflow

From the root of your theme repository, run:

```sh
mkdir -p .github/workflows
curl -fsSL https://github.com/BillyNoyes/Proof/releases/download/v1.0.0/theme-proof.yml \
  -o .github/workflows/theme-proof.yml
```

Or copy the [ready-made workflow](examples/theme-proof.yml) into `.github/workflows/theme-proof.yml`.

Commit the file and open a pull request. **That’s it** for a complete theme at the repository root, including Dawn.

> Use this reusable workflow for the complete Proof setup. The snippet offered by GitHub Marketplace is the lower-level deployment Action, not the isolated build/deploy workflow.

## Does your theme have a build step?

Add a small `theme-proof.config.json` describing your install command, build command, and deployable theme directory. See [Build configuration](https://proof.billynoyes.co.uk/docs/#configuration) for examples covering Vite, Easel, nested projects, and no-build themes.

## What Proof does

1. Builds PR code in a read-only job with no Shopify credentials.
2. Validates and deploys only the theme files as a development preview.
3. Updates one PR comment with preview links and removes the preview when the PR closes.

Proof never targets live or existing themes. Read the [documentation](https://proof.billynoyes.co.uk/docs/) for security details, troubleshooting, and lifecycle behavior.

## Support

[Open an issue](https://github.com/BillyNoyes/Proof/issues/new/choose) or report security issues through [private vulnerability reporting](https://github.com/BillyNoyes/Proof/security/advisories/new).

Proof is MIT licensed and independently developed, with no Shopify sponsorship or endorsement.
