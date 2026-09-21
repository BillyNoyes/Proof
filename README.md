# Proof

**Theme Proof — automatic pull request previews for Shopify Liquid themes.**

Proof is a planned open-source GitHub integration that builds a theme for each pull request, deploys it as a Shopify preview, and maintains one comment with the latest storefront and Theme Editor links.

> **Status:** architecture and feasibility planning. No GitHub Action, app, or npm package has been published yet.

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

## Security model

Untrusted pull request code must never run with Shopify credentials. Proof will separate builds from deployment:

- The build job has no Shopify secret and produces an artifact.
- The deployment job does not execute repository scripts. It accepts only validated theme files and holds the Theme Access credential.
- Fork pull requests do not deploy automatically.
- Live themes are never valid preview targets.

## Scope

The first version is expected to provide a reusable GitHub Actions workflow and deployment action. A hosted GitHub App may follow after the workflow and security model are proven.

Proof is independently developed and has no Shopify sponsorship or endorsement.

See [PLAN.md](PLAN.md) for the proposed architecture, constraints, milestones, and validation plan.

## License

MIT
