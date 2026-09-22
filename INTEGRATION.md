# Private development-store validation

The preview lifecycle was exercised against an authorized development store using a private consumer repository. Store identifiers, credentials, theme IDs, preview URLs, raw logs, and private run links are intentionally omitted from this public report. Raw evidence remains private.

## Tested revision

- Reusable workflow: `c0d00a4268dc4690762c5e326d0c9b20dce5a927`.
- Bundled build/deployment Actions: `d842aabe99a40352073065ea538a360c533f3f71`.
- Shopify CLI: `4.8.0`.
- Hosted workflow: Ubuntu, Node.js 24, Theme Access authentication.

The v1 workflow pins runtime commit `78a5f11269ec3a55c06e860453a1bc0c490d6d4b`. Its deployment behavior and build bundle are unchanged from the store-tested revision. It adds a cleanup recovery pass for the case where a replacement upload succeeds but posting its newer comment state fails; that pass reuses the already tested exact-context deletion path and has regression coverage.

## Results

| Scenario                                               | Result                                                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No-build theme with no config file                     | Passed: build, artifact transfer, strict upload, and bot comment.                                                                                                           |
| Nested project with setup, install, and build commands | Passed: complete theme generated in a nested output directory and deployed.                                                                                                 |
| Build isolation                                        | Passed: runner reported read-only repository permissions; build assertions found no deployment credential or store setting.                                                 |
| Artifact contents                                      | Passed: only theme files transferred, including the generated asset; no build scripts or package metadata.                                                                  |
| Named secret authorization                             | Passed after correcting the reusable-workflow declaration and caller mapping. The actual credential remained Environment-scoped.                                            |
| Subsequent commits                                     | Passed: same development theme, context, preview URL, and comment; recorded SHA advanced to the current head.                                                               |
| Manual deletion followed by update                     | Passed: a new development theme was created and the same comment updated.                                                                                                   |
| PR close and repeated cleanup                          | Passed: preview removed and repeat cleanup succeeded when it was already absent.                                                                                            |
| Close during an active build                           | Passed: cleanup removed the preview; the later deployment skipped the closed PR rather than recreating it.                                                                  |
| Reopen followed by rerunning an old close event        | Passed: reopened preview and comment remained unchanged.                                                                                                                    |
| Rerunning an old deployment                            | Passed: stale SHA was skipped and current preview/comment remained unchanged.                                                                                               |
| Controlled build supersession                          | Passed: an executing build was canceled by a newer commit, and the newest head deployed successfully.                                                                       |
| Invalid credential                                     | Passed at the CLI boundary: authentication failed rather than being treated as a missing theme or successful operation. The valid credential was not revoked by automation. |
| Partial-upload reporting                               | Passed: actual exit-zero upload errors in incomplete fixtures were rejected by Proof's parser; the complete fixture then uploaded successfully.                             |
| Fork and `pull_request_target` guards                  | Passed with synthetic events executed through the actual bundled Action, before Shopify execution. A cross-account fork was not created.                                    |

## Browser checks and limits

The storefront preview URL reached the store's password gate with HTTP 200. The Theme Editor URL reached Shopify's authentication flow with HTTP 200. Store/theme identity checks in Proof passed.

These checks validate protected-store routing, not authenticated page content or Theme Editor interactions. No storefront password or authenticated admin browser session was supplied. The Theme Access credential is not a storefront or admin-login password.

Natural seven-day development-theme expiration was not observed. Manual deletion and already-missing-theme behavior were tested instead. GitHub cancellation/event ordering cannot guarantee reconciliation after every platform outage or manual intervention; failed or canceled jobs may still require a cleanup rerun.

## Test fixture requirements

Use a complete deployable theme, not merely a syntactically valid layout. Shopify can reject removal of required files such as `config/settings_schema.json` or `templates/gift_card.liquid` during synchronization. Artifact validation and Theme Check do not replace remote upload-result validation.

## Cleanup and confidentiality

Both test PRs were closed and every test-created theme was removed. The final theme inventory matched the original theme IDs, names, and roles. No existing theme was targeted for upload or deletion.

The test credential and store variable were removed from the private GitHub environment, and local copies of the credential were deleted. The owner should also revoke the dedicated Theme Access password in Shopify; deleting a GitHub secret does not revoke the Shopify credential.

This report contains no store-specific data and is not a claim of exhaustive platform coverage or an independent security certification.
