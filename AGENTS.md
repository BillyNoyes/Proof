# Working with Proof

This file is for coding agents helping someone install Proof or change this repository.

## Installing Proof in another repository

Use the reusable workflow in [`examples/theme-proof.yml`](examples/theme-proof.yml). Do not replace it with a single `uses: BillyNoyes/Proof@…` step: separate jobs are the security boundary between untrusted PR builds and Shopify credentials.

Required GitHub Environment:

- Name: `theme-preview`
- Secret: `SHOPIFY_CLI_THEME_TOKEN`, containing a dedicated Shopify Theme Access password
- Variable: `SHOPIFY_FLAG_STORE`, containing the full `myshopify.com` domain

Never ask a user to paste credentials into source files, workflow YAML, issues, logs, comments, or chat. If a credential is exposed, stop and tell the user to revoke it in Theme Access.

For a complete no-build theme at the repository root, including Dawn, do not create a config file. If a build is required, create static `theme-proof.config.json` using the schema in [`schema/theme-proof.schema.json`](schema/theme-proof.schema.json). Build paths are relative to the repository root. Store details and deployment targets never belong in this file.

## Repository map

- `src/build-action.ts`: untrusted build entry point
- `src/action.ts`: privileged deployment and cleanup entry point
- `src/artifact.ts`: theme allowlist and artifact limits
- `src/preview.ts`: PR lifecycle orchestration
- `src/shopify.ts`: Shopify CLI contract and remote safety checks
- `src/github.ts`: PR state and comment API
- `.github/workflows/preview.yml`: public reusable workflow
- `actions/build/action.yml`: build sub-action metadata
- `action.yml`: deployment Action metadata and Marketplace entry point
- `dist/`: committed self-contained Node.js Action bundles
- `site/`: website and documentation
- `test/`: Action/core tests

## Non-negotiable safety rules

- PR-controlled code may run only in the build job, with no Shopify environment and read-only repository permission.
- Credentialed jobs must not check out or execute repository scripts.
- Never add live-theme, publish, or arbitrary privileged Shopify CLI flags.
- Only exact development contexts owned by the repository and PR may be created or deleted.
- Verify current PR state, remote theme role, context, and deletion result.
- Fork PRs and `pull_request_target` deployments remain unsupported.
- Internal and third-party Actions must use full commit SHA pins.
- Do not weaken artifact path, symlink, type, count, or size validation.
- Do not log credentials, store-specific private evidence, preview URLs from private tests, or raw environment dumps.

## Development

Use Node.js 22.12 or newer and pnpm 10.28.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm audit --registry=https://registry.npmjs.org
pnpm --filter proof-site exec playwright install chromium
pnpm test:site:browser
```

For custom-domain behavior, also run:

```sh
SITE_BASE_PATH=/ pnpm test:site
SITE_BASE_PATH=/ pnpm test:site:browser
```

`pnpm build` regenerates `dist/` and `THIRD_PARTY_NOTICES.md`. Commit generated changes and verify they are reproducible. CI additionally runs the build Action itself, workflow linting, browser checks, and Linux/macOS/Windows validation.

## Change guidance

- Add regression coverage for every behavioral fix.
- Keep comments limited to durable intent, non-obvious invariants, or external contracts.
- Keep the README focused on the shortest safe setup. Put detailed configuration and troubleshooting on the docs site.
- Keep setup examples synchronized across `README.md`, `examples/theme-proof.yml`, and `site/docs/index.html`; `test/workflow.test.ts` enforces their release and secret contracts.
- Preserve both root (`/`) and project (`/Proof/`) site builds, mobile layout, reduced motion, keyboard access, and no-JavaScript reading.
- Ordinary tests must use fake Shopify runners and HTTP fixtures. Store-backed tests require explicit authorization, private evidence, a dedicated preview context, and verified cleanup without touching existing themes.

## Releases

Follow [`RELEASING.md`](RELEASING.md). A release is not a Marketplace publication until the listing is verified. Stable `v1.x` releases use immutable version tags; move the `v1` tag only after the exact release commit passes all gates. Do not claim live Shopify behavior beyond the sanitized evidence in [`INTEGRATION.md`](INTEGRATION.md).
