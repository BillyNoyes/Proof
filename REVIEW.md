# Repository release review

Review baseline: `de8601e` (before the release-hardening changes).

## Decision

**Automated checks and private development-store lifecycle validation have passed.** The review found and corrected functional and security defects that passing unit tests had not covered. The subsequent [integration report](INTEGRATION.md) documents actual Theme Access, context reuse, comments, cleanup, and concurrency checks, along with browser-authentication and expiration limits. Marketplace publication still requires GitHub's release-page eligibility checks and the owner's final publishing action.

## Scope

Reviewed the deployment and build entry points, Shopify/GitHub clients, state comments, configuration and schema, artifact staging, process execution, reusable workflow, CI and Pages workflows, bundled runtime packaging, dependency/license metadata, tests, and the documentation site. The pinned Shopify CLI 4.8.0 npm distribution was inspected for its actual flags, strict-push output, partial-upload reporting, context naming, and list/delete behavior.

This was a repository review, not an independent penetration test or a store-backed certification.

## Corrected findings

| Priority           | Finding                                                                                                                 | Correction and regression coverage                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| High               | Push omitted the `--development` flag required by `--development-context`.                                              | Both flags are emitted; argument construction is asserted in tests.                                                                               |
| High               | Strict pushes emit a Theme Check JSON array before the theme JSON. A single-document parser rejected successful pushes. | Parse and validate the supported two-document output while rejecting unrelated output or failing checks.                                          |
| High               | CLI can report upload errors in `theme.warning`/`theme.errors` with exit code zero.                                     | Fail the deployment rather than posting a success comment.                                                                                        |
| High               | Inherited Shopify CLI environment flags could alter targeting or enable publishing.                                     | Clear inherited Shopify flags and unrelated credentials before constructing the CLI environment.                                                  |
| High               | Cleanup trusted the recorded ID without checking the remote role or context. Missing themes were not idempotent.        | List themes, verify development role and exact context, delete, then confirm absence. Authentication failures remain failures.                    |
| High               | Build inherited PR-write permissions; fork/event restrictions were absent in the reusable workflow.                     | Explicit read-only build permissions; same-repository `pull_request` guards in the workflow and deployment entry point.                           |
| High               | Cancellation and reruns could race mutations or delete a reopened PR's preview.                                         | Separate build cancellation from serialized deploy/cleanup, check current PR state and SHA, and recover unrecorded previews by a trusted context. |
| Medium             | Build checked out GitHub's merge ref while the comment recorded the head SHA.                                           | Checkout the exact PR head SHA.                                                                                                                   |
| Medium             | Workspace paths could escape through symlink ancestors; a directory could satisfy the required layout-file check.       | Canonical workspace containment checks and a regular-file requirement for `layout/theme.liquid`.                                                  |
| Medium             | `strict: false` still reported Theme Check as passed.                                                                   | Comment says “not run”; lifecycle regression test verifies it.                                                                                    |
| Medium             | Timeout handling killed only a parent process, allowing descendants to continue.                                        | Terminate the process tree; add actual subprocess timeout/output/exit tests.                                                                      |
| Release hygiene    | Generated bundles lacked an explicit aggregate dependency-license notice.                                               | Generate and commit notices for all six bundled runtime dependencies; CI verifies reproducibility.                                                |
| Dependency hygiene | A low-severity esbuild development-server advisory affected the build dependency.                                       | Pin tsup's esbuild to patched 0.28.1 and verify bundles/checks. The runtime does not use that development server.                                 |

Additional validation tightens comment identity, URL paths and credentials, config/schema agreement, and GitHub request timeouts. Release preparation pins internal Action references to a reviewed bundle commit instead of a moving branch.

## Validation

- 72 Action/core tests, including real subprocess tests and YAML workflow-policy assertions.
- 15 site interaction tests.
- Formatting, typed linting, and strict TypeScript checks.
- Self-contained Node 24 CommonJS Action bundles and generated license notices.
- Browser checks for both `/Proof/` and root-path hosting in CI, light/dark modes, desktop fit, mobile layout, clipboard behavior, direct links, and no-JavaScript reading.
- Public npm registry audit: no known vulnerabilities at review time.
- CI additionally checks Windows, macOS, Linux, Node 22.12/24, workflow linting, bundle reproducibility, and actual build-Action execution.

## Outstanding gates

1. **Integration coverage:** the supported lifecycle was validated in a private consumer repository. A missing named-secret authorization was corrected and regression-tested. Authenticated storefront/editor UI, natural seven-day expiration, and a cross-account fork remain outside the executed scope; see [INTEGRATION.md](INTEGRATION.md). Store-specific evidence and identifiers must remain private.
2. **Marketplace publication:** use GitHub's release UI to validate name availability, choose the Marketplace category, and select the publication checkbox. The repository owner must satisfy GitHub's 2FA and Developer Agreement requirements. A draft release does not establish Marketplace eligibility or publish a listing.

## Residual limitations

Only development-context targets and the documented GitHub-hosted Ubuntu deployment workflow are supported. Existing/unpublished theme modes, GitHub Enterprise Server, and scheduled stale-preview reconciliation are not implemented. GitHub concurrency does not guarantee event ordering, and canceled/failed runs can require cleanup to be rerun. There is no claim that unit tests prove live Shopify behavior.
