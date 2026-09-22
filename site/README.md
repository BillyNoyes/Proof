# Proof website

A static, two-page Vite site using Alpine.js and Tailwind CSS. The landing page fits a desktop viewport without hiding overflow; smaller screens and enlarged text reflow naturally. The homepage illustrates PR creation, an isolated build, deployment, and a GitHub Actions bot comment. It plays once, then holds the result; visitors can pause, replay, or select a step. Playback suspends in hidden tabs and when the demo is offscreen. Reduced-motion users get an untimed walkthrough, and the completed example remains readable without JavaScript. All demo details are fictional and its preview links are non-interactive. Documentation also remains readable without JavaScript.

## Development

From the repository root:

```sh
pnpm install
pnpm dev:site
pnpm test:site
pnpm --filter proof-site exec playwright install chromium
pnpm test:site:browser
```

The default local path is `/Proof/`, matching GitHub project Pages. `SITE_BASE_PATH=/ pnpm dev:site` serves from the root instead. Build with `pnpm build:site`; output is in `site/dist`.

Browser checks cover light/dark themes, desktop viewport fit and layout stability at every demo step, mobile reflow, playback and keyboard controls, reduced motion, direct docs links, navigation, clipboard success/failure, missing JavaScript, and missing assets. Unit tests cover timer/observer teardown, visibility changes, playback controls, and parity between the illustrated bot comment and the Action's real comment renderer. Screenshots are written to `site/.screenshots/` (not committed). `CHROME_PATH` can select an existing Chrome installation.

## Deployment

The `Deploy documentation` workflow builds and deploys `site/dist` on pushes to `main`. In repository **Settings → Pages**, select **GitHub Actions** as the source. GitHub's Pages configuration supplies the deployment base path. No Shopify credentials are involved.

The public URL is `https://proof.billynoyes.co.uk/`, configured as the custom domain in GitHub Pages. The workflow builds at `/` for this domain and also supports the `/Proof/` project path. If the domain changes, update canonical and Open Graph URLs in both HTML pages as well as the links in the root README.

## Content and design

- Documentation describes the implementation in this repository, not a future Marketplace release. Update release notices and examples only when corresponding functionality ships.
- Fonts, 12px/20px outer gutters, 1,152px landing width, and stack follow [Easel](https://github.com/BillyNoyes/Easel/tree/main/site).
- Visual direction follows [Vercel's design guidance](https://vercel.com/design.md): monochrome, clear hierarchy, meaningful grouping, and automatic light/dark themes. This is a Proof site, not a Vercel-branded report.
- `ASSETS.md` records font and reused code attribution.
