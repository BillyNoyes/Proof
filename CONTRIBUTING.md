# Contributing

Focused issues and pull requests are welcome while Proof is in active development.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
```

Use Node.js 22.12 or newer. The committed `dist` output and generated `THIRD_PARTY_NOTICES.md` must match the TypeScript source and bundled dependencies. `pnpm build` regenerates both.

## Safety requirements

- Never add Shopify credentials, GitHub tokens, storefront passwords, customer data, or merchant data to fixtures, logs, issues, or commits.
- Keep untrusted build execution separate from privileged deployment.
- Never add live-theme deployment flags.
- Store-backed tests must use a dedicated development store and clean up created themes.
- Use fake process runners and HTTP fixtures for ordinary tests.
- Report vulnerabilities through GitHub private vulnerability reporting.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
