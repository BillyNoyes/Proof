# Proof plan

## Product definition

Proof is an open-source pull request preview system for Shopify Liquid themes. Its long name is Theme Proof. It builds a pull request without exposing store credentials, deploys the validated theme artifact to a Shopify store, and keeps a stable preview comment up to date.

Proof complements theme authoring frameworks and build tools. It does not require Blueprint or Easel and must work with any standard Shopify theme that can produce a deployable theme directory.

## Goals

- Create or reuse one Shopify preview context per pull request.
- Update the same preview after each accepted commit.
- Publish storefront and Theme Editor links in one persistent pull request comment.
- Keep Shopify credentials out of untrusted builds.
- Run Shopify Theme Check before deployment.
- Clean up previews when pull requests close.
- Produce machine-readable output for automation and future testing integrations.
- Remain useful as an open-source GitHub Actions workflow before any hosted service exists.

## Non-goals

- Replacing Shopify CLI.
- Authenticating users through stored Shopify CLI browser sessions.
- Publishing or modifying a live theme.
- Building a Liquid runtime or local Shopify emulator.
- Managing merchant storefront passwords.
- Automatically deploying untrusted fork pull requests.
- Requiring Blueprint, Easel, or a specific frontend framework.
- Launching with a hosted multi-tenant Shopify OAuth app.

## Confirmed platform capabilities

Shopify supports the core workflow through public tooling:

- The Theme Access app creates revocable credentials for theme development and CI.
- Shopify CLI accepts `SHOPIFY_CLI_THEME_TOKEN` and `SHOPIFY_FLAG_STORE` in CI.
- `shopify theme push --development --development-context <context>` creates or reuses a named development context.
- `shopify theme push --json` returns the theme ID, role, shop, editor URL, and preview URL.
- `shopify theme push --strict` requires Theme Check to pass without errors.
- `shopify theme delete --theme <id> --force` supports non-interactive cleanup.
- Development themes do not count toward the normal theme limit and are removed after seven days of inactivity.

The initial implementation should pin and test a supported Shopify CLI version. CLI flags and JSON output must be treated as an external contract with compatibility tests.

## Naming and distribution

| Surface                    | Planned value           |
| -------------------------- | ----------------------- |
| Product                    | Proof                   |
| Long name                  | Theme Proof             |
| Repository                 | `BillyNoyes/Proof`      |
| npm package                | `theme-proof`           |
| CLI executable             | `theme-proof`           |
| GitHub Action display name | Theme Proof             |
| GitHub check               | `Theme Proof / Preview` |
| Development context prefix | `proof-`                |

The npm package will be unscoped. GitHub Action syntax necessarily contains the repository owner, but the product and package name will not.

## Authentication model

### Initial open-source workflow

The store owner installs Shopify's Theme Access app, generates a dedicated password, and creates a GitHub Environment named `theme-preview` with:

- `SHOPIFY_CLI_THEME_TOKEN` as an Environment secret.
- `SHOPIFY_FLAG_STORE` as a non-sensitive Environment variable containing the full myshopify.com domain.

The reusable workflow attaches the Environment only to deployment and cleanup jobs. Callers authorize the named `SHOPIFY_CLI_THEME_TOKEN` secret through an explicit mapping rather than broad inheritance; the actual password remains environment-scoped and the untrusted build job has no Environment. Repositories can add required reviewers or deployment restrictions, although requiring review prevents fully automatic previews.

The workflow uses the repository `GITHUB_TOKEN` only for pull request comments and checks. It needs minimal permissions:

- `contents: read`
- `pull-requests: write`
- `checks: write` when checks are enabled

### Future hosted GitHub App

A GitHub App can receive pull request webhooks, queue isolated builds, deploy artifacts, and update comments using short-lived installation tokens. Store credentials can initially remain Theme Access passwords encrypted with a managed key service.

### Future Shopify OAuth app

A multi-merchant OAuth app requires public Shopify distribution and app review. Offline tokens are appropriate for background deployments. Open-source code does not remove Shopify distribution, security, privacy, or review requirements. OAuth should only be added after Theme Access onboarding is proven to be the primary adoption barrier.

## Security architecture

### Untrusted build job

The build job:

- Checks out the pull request commit.
- Has no Shopify credential, GitHub App key, or deployment token.
- Installs dependencies and runs the configured build command.
- Produces a theme artifact.
- Uploads the artifact for the deployment job.
- Can be cancelled when a newer commit arrives.

Repository scripts, Vite plugins, and dependencies are untrusted. Network egress should be constrained where the execution platform allows it.

### Privileged deployment job

The deployment job:

- Does not check out or execute pull request scripts.
- Downloads only the prepared artifact.
- Rejects symlinks, path traversal, devices, and unsupported file types.
- Allows only `assets`, `blocks`, `config`, `layout`, `locales`, `sections`, `snippets`, and `templates`.
- Applies per-file and total artifact size limits.
- Runs Theme Check or verifies a trusted Theme Check result.
- Holds the Theme Access credential only for the upload step.
- Never accepts `--live`, `--publish`, or `--allow-live` behavior.
- Parses Shopify CLI JSON instead of terminal formatting.

The workflow must not use `pull_request_target` to execute pull request code. Fork previews are disabled by default and require an explicit trusted workflow if supported later.

## Project configuration

Proof uses a static `theme-proof.config.json` file with JSON Schema support. The file is read only by the untrusted build job and can define:

- `build.workingDirectory`: where setup, install, and build commands run.
- `build.setup`: optional package-manager or toolchain setup command.
- `build.install`: optional install command.
- `build.command`: optional build command.
- `build.themeDirectory`: deployable theme path after the build.

All paths are relative to the repository root and cannot escape the GitHub workspace. Omitting all three commands supports standard themes such as Dawn that need no build. The current schema deliberately does not accept store domains, credentials, theme IDs, live-theme flags, or arbitrary Shopify CLI arguments.

Preview target policy belongs to the trusted workflow or GitHub Environment, not pull request code. The default target is a per-PR development context. Future modes can include:

- `development-context`: create or reuse the isolated PR context; default.
- `unpublished`: create and retain an unpublished theme, then update its recorded ID.
- `existing`: update a trusted, fixed theme ID after verifying through Shopify that its role is not live.

The latter two modes must never accept their theme ID from a PR-controlled config file.

## Preview identity and lifecycle

A context must be unique across repositories that connect to the same store. Derive it from stable identifiers rather than repository names alone, for example:

```text
proof-<repository-id>-<pull-request-number>
```

Hash or truncate the value if Shopify imposes a context length limit.

### Open or synchronize

1. Cancel an older in-progress build for the same pull request; serialize remote mutations without canceling an active deployment.
2. Build the latest commit without credentials.
3. Validate and upload the artifact.
4. Check current PR state and head SHA, then push with the stable development context and JSON output.
5. Record the returned theme ID and URLs.
6. Create or edit the bot-owned pull request comment.

### Close

1. Confirm the PR is still closed and read the theme ID from the matching bot-owned comment marker; if no comment was recorded, resolve the trusted context by name.
2. Verify the remote theme's current development role and exact context name before deleting with confirmation disabled.
3. Confirm removal, then update the recorded comment if one exists.
4. Treat an already missing theme as successful cleanup, but do not treat authentication or network failures as missing themes.

A hosted app should store this mapping in a database. The Actions-only version can use a machine-readable marker in a comment created by the action, but must verify comment authorship before trusting it.

## Pull request comment

Proof should update one comment instead of posting repeatedly:

```text
Theme Proof

Preview updated for <short-sha>.

Storefront preview
Theme Editor

Theme Check: passed
Build: passed
Updated: <timestamp>
```

The comment must never contain Theme Access credentials, storefront passwords, customer data, or full environment dumps.

## Repository structure

```text
.
├── .github/workflows/
├── actions/build/
├── dist/
├── schema/
├── scripts/
├── src/
│   ├── action.ts
│   ├── artifact.ts
│   ├── build-action.ts
│   ├── build-runner.ts
│   ├── comment.ts
│   ├── config.ts
│   ├── github.ts
│   ├── project-config.ts
│   └── shopify.ts
├── test/
├── action.yml
├── package.json
├── README.md
└── PLAN.md
```

A reusable workflow is preferable to a single action for the full preview flow because GitHub jobs are the security boundary between untrusted builds and privileged deployment. Individual deployment and cleanup actions can live inside the same repository.

## Proposed interface

Build-action inputs should remain small and explicit:

- `config`: static JSON config path, default `theme-proof.config.json`.

Deployment inputs are trusted workflow policy:

- `theme-path`: validated theme artifact downloaded from the build job.
- `context`: stable preview context, defaulted from repository and pull request IDs.
- `target-mode`: initially only `development-context`.
- `shopify-cli-version`: pinned supported CLI version.
- `strict`: require Theme Check success, default `true`.
- `cleanup`: remove previews when pull requests close, default `true`.

Outputs:

- `theme-id`
- `preview-url`
- `editor-url`
- `shop`
- `deployed-sha`

Avoid accepting arbitrary Shopify CLI arguments in the privileged job. Model safe options explicitly and reject live-theme flags.

## Current implementation status

Implemented in the initial prototype:

- Static versioned project configuration and JSON Schema.
- Setup, install, build, and no-build paths.
- Clean artifact staging and strict deployment validation.
- Shopify CLI command construction without shell interpolation in privileged jobs.
- Credentials supplied through environment variables rather than arguments.
- Shopify CLI version and JSON output validation.
- Development-context deployment and theme deletion.
- Bot-owned pull request comment state.
- Reusable workflow separating untrusted build, privileged deployment, and cleanup.
- Unit tests and self-contained Node 24 Action bundles.

Still unproven until store-backed validation:

- Development-context reuse with Theme Access under concurrent pull request updates.
- Preview and Theme Editor links on protected storefronts.
- Cleanup behavior for expired or manually removed development themes.
- End-to-end reusable workflow permissions and artifact semantics in a consumer repository.

## MVP milestones

### Milestone 1: research spike

- Confirm `--development-context` reuse using a Theme Access credential on a dedicated development store.
- Capture and version the `--json` output contract.
- Confirm preview and editor links across password-protected and unprotected stores.
- Confirm cleanup by theme ID.
- Measure behavior after context inactivity and manual theme deletion.

### Milestone 2: deployment core

- Parse and validate static project configuration.
- Support explicit install/build commands and no-build themes.
- Validate theme artifacts.
- Wrap pinned Shopify CLI commands without shell interpolation.
- Parse and validate JSON output.
- Implement safe create-or-update behavior.
- Implement idempotent deletion.
- Add unit tests for rejected paths, symlinks, limits, and unsafe flags.

### Milestone 3: GitHub integration

- Build reusable workflow with separate build and deployment jobs.
- Cancel superseded builds and serialize deployment/cleanup per pull request.
- Create and update a persistent pull request comment.
- Store trusted cleanup state.
- Support open, synchronize, reopen, and close events.
- Add clear behavior for forks and missing secrets.

### Milestone 4: release

- Pin internal Action references to reviewed commit SHAs, publish versioned releases, and create a moving `v1` major tag only for a validated stable release.
- Publish `theme-proof` only if a CLI or reusable Node API is useful outside Actions.
- Add provenance and trusted publishing.
- Document permissions, secrets, threat model, and incident reporting.
- Test against a Blueprint theme, an Easel theme, and a plain Shopify theme.

### Milestone 5: quality signals

- Add Theme Check annotations.
- Add screenshots and browser traces.
- Add optional accessibility and functional checks.
- Add deployment history and stale-preview reconciliation.

## Test strategy

### Unit tests

- CLI argument construction.
- JSON output validation.
- Context generation and truncation.
- Pull request comment rendering and marker parsing.
- Artifact allowlist and path validation.
- Secret redaction.
- Retry classification.

### Integration tests

- Fake Shopify CLI process with success, warnings, malformed JSON, timeout, and partial failure.
- GitHub webhook fixtures for every supported pull request event.
- Artifact transfer between jobs.
- Concurrent updates where an older commit finishes after a newer one.

### Store-backed tests

Run against a dedicated development store only:

- First preview creation.
- Reuse after a new commit.
- Stable preview URL.
- Theme Editor URL.
- Password-protected storefront behavior.
- Cleanup and repeated cleanup.
- Theme manually deleted between updates.

Store-backed tests must never target a live merchant theme.

## Operational requirements

- Structured logs with credential redaction.
- Timeouts for install, build, upload, and delete operations.
- Retries only for classified transient failures.
- Concurrency control per repository and pull request.
- Cleanup reconciliation for abandoned previews.
- Pinned third-party actions and Shopify CLI versions.
- Clear status when Shopify is unavailable or credentials are revoked.

## Open questions

- Maximum accepted development-context length and character set.
- Number of simultaneous development contexts supported per store.
- Exact lifetime and cleanup behavior for context-created themes.
- Preview sharing behavior on password-protected stores.
- Whether the Actions-only version should store state in a comment, check run, deployment, or external artifact.
- Whether Theme Check should run before artifact upload, again before deployment, or both.
- Whether the first release should support monorepos and multiple themes.
- Whether a hosted App should continue accepting Theme Access or move directly to Shopify OAuth.

## Product boundaries

Proof is not an official Shopify product. It should use Shopify only descriptively, avoid Shopify brand assets as its identity, and never claim endorsement. Users must have authorization to access connected stores and remain responsible for their use of Shopify CLI and Shopify services.
