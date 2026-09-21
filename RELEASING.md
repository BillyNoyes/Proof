# Releasing Theme Proof

A GitHub release is not automatically a GitHub Marketplace listing. Do not publish a release or create a moving major tag until the checks below are complete.

## Automated checks

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm --filter proof-site exec playwright install chromium
pnpm test:site:browser
pnpm audit --registry=https://registry.npmjs.org
```

Require a passing CI run for the exact release commit, including the real build-Action smoke test, cross-platform bundle reproducibility, workflow policy tests, and site browser checks. Commit regenerated `dist` files. The Shopify CLI used by the reusable workflow is pinned to `4.8.0`; minimum supported CLI version is also `4.8.0`.

## Required development-store validation

Use an authorized, dedicated development store. Never use a live merchant store for this test. Create a separate consumer theme repository and configure its `theme-preview` environment:

- Secret: `SHOPIFY_CLI_THEME_TOKEN`, a dedicated Theme Access password.
- Variable: `SHOPIFY_FLAG_STORE`, the development store's full myshopify.com domain.

Do not send credentials in chat, logs, issues, or release notes. Theme Access has theme-write privileges; revoke the test credential when finished.

Use the caller workflow in the README, pointing at the release candidate commit. The reusable workflow's own `BillyNoyes/Proof` Action references must all be full commit SHAs containing the reviewed bundles, not `main` or a moving major tag.

Record consumer workflow run URLs privately and publish only sanitized results. Use a private consumer repository when store identifiers and preview URLs must not appear in public Actions logs or PR comments. The executed release-candidate coverage is documented in [INTEGRATION.md](INTEGRATION.md).

Validation checklist:

- [ ] Open a same-repository PR with a plain no-build theme. Confirm deployment and one bot comment.
- [ ] Open a PR using a real project build, including a nested output directory. Confirm the complete theme is staged.
- [ ] Push another commit. Confirm context and theme ID reuse and that the comment records the checked-out head SHA.
- [ ] Verify storefront and Theme Editor links on a password-protected development store. Do not record its password.
- [ ] Close the PR. Confirm the correct development theme is removed and its comment updated.
- [ ] Rerun cleanup. Confirm an already missing theme is treated as success.
- [ ] Delete a preview manually, then update its PR. Confirm it is recreated and the new ID recorded.
- [ ] Reopen a PR and rerun an older close workflow. Confirm it does not delete the reopened preview.
- [ ] Trigger rapid updates and close a PR during a build/deploy. Confirm no stale deployment survives cleanup; rerun cleanup if a manually canceled workflow requires reconciliation.
- [ ] Confirm a fork PR is skipped and that the build job has no Shopify environment and no PR-write permission.
- [ ] Verify invalid credentials fail without exposing a credential or announcing successful deployment. Ask the owner to revoke the dedicated test password after testing.

Unit tests and inspection of CLI source are not substitutes for these runs. Keep credentials and store-specific evidence in private test infrastructure, not in the public Proof repository. Distinguish authenticated UI checks from reaching a password or login gate.

## Prepare a version

1. Choose an explicit pre-release version while the project remains experimental; do not create `v1` as an alias for an unvalidated alpha.
2. Pin the reusable workflow's build/deploy/cleanup Action references to the reviewed bundle commit. That commit can precede the release commit that updates documentation and references.
3. Run all checks and commit the exact release tree. Ensure CI passes for that commit.
4. Prepare release notes with supported features, required credentials, permissions, known limitations, consumer test evidence, and SHA-pinned usage.
5. Draft the release against that commit. Leave it unpublished while any validation item is pending. Do not mark an alpha as the latest stable release.

## Publish to Marketplace

The repository is public and has one root `action.yml`; the build sub-action is not a separate Marketplace listing. The Marketplace name is **Theme Proof**. GitHub's release page is the authority on name availability and metadata eligibility.

After validation:

1. Open the release draft from the repository's **Releases** page.
2. The repository owner must have two-factor authentication enabled and accept the **GitHub Marketplace Developer Agreement** if prompted. Do not delegate acceptance without reviewing the agreement.
3. Select **Publish this Action to the GitHub Marketplace**.
4. Resolve any metadata or naming errors reported by GitHub.
5. Choose **Deployment** as the primary category; optionally choose **Continuous integration** as a secondary category if available.
6. Confirm the version, target commit, pre-release status, and completed store-validation evidence, then publish.
7. Verify the actual Marketplace listing and the released caller workflow. Update README/site examples and release status to the published version.

There is no supported `gh release create` flag that selects Marketplace publication. A release URL alone is not proof that an Action was listed.

Reference: [Publishing actions in GitHub Marketplace](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace).

## Known operational boundaries

- Only development-context previews are supported. Existing-theme and unpublished-theme targeting are not implemented.
- The supported deployment workflow runs on GitHub-hosted Ubuntu and Node.js 24. Cross-platform source tests are not a claim of store-backed deployment support on every operating system.
- Protect workflow changes and use environment reviewers where necessary. A repository collaborator able to modify a credentialed workflow can change its security boundary.
- GitHub concurrency does not guarantee ordering. Proof checks current PR state and serializes mutations, but manually canceled or failed jobs may require a cleanup rerun. There is no scheduled stale-preview reconciler.
- Proof requires GitHub.com; GitHub Enterprise Server API endpoints are not implemented.
