import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {preview} from 'vite';

const base = process.env.SITE_BASE_PATH || '/Proof/';
const server = await preview({
  preview: {host: '127.0.0.1', port: 0, strictPort: true},
});
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {}),
});
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
await mkdir(screenshots, {recursive: true});
const errors = [];
try {
  for (const colorScheme of ['light', 'dark']) {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1280, 600],
      [1024, 600],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [320, 640],
    ]) {
      const context = await browser.newContext({
        viewport: {width, height},
        colorScheme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400)
          errors.push(`${response.status()}: ${response.url()}`);
      });
      for (const route of ['', 'docs/']) {
        await page.goto(`${origin}${base}${route}`);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1);
        const dimensions = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          font: getComputedStyle(document.body).fontFamily,
        }));
        assert.ok(dimensions.font.includes('Inter'));
        assert.ok(
          dimensions.width <= width,
          `${route} overflows horizontally at ${width}: ${dimensions.width}`,
        );
        if (!route && width >= 1024)
          assert.ok(
            dimensions.height <= height,
            `Landing scrolls at ${width}×${height}: ${dimensions.height}`,
          );
        await page.screenshot({
          path: `${screenshots}/${route ? 'docs' : 'home'}-${width}-${colorScheme}.png`,
        });
      }
      if (width < 1024) {
        await page.locator('.mobile-nav summary').click();
        await page.locator('.mobile-nav a[href="#configuration"]').click();
        await page.waitForURL('**/#configuration');
        assert.equal(
          await page.locator('.mobile-nav').getAttribute('open'),
          null,
        );
        await page.waitForFunction(
          () => document.activeElement?.id === 'configuration',
        );
      } else {
        await page.locator('.docs-sidebar a[href="#theme-access"]').click();
        await page.waitForURL('**/#theme-access');
        await page.waitForFunction(
          () => document.activeElement?.id === 'theme-access',
        );
        assert.equal(
          await page
            .locator('.docs-sidebar a[href="#theme-access"]')
            .getAttribute('aria-current'),
          'location',
        );
      }
      await page.goto(`${origin}${base}`);
      await page.goto(`${origin}${base}docs/#configuration`);
      await page.waitForFunction(
        () =>
          document
            .querySelector('.docs-sidebar a[href="#configuration"]')
            ?.getAttribute('aria-current') === 'location',
      );
      await context.close();
    }
  }
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await page.goto(`${origin}${base}docs/`);
  const block = page.locator('.code-block').nth(1);
  await block
    .getByRole('button', {name: 'Copy .github/workflows/theme-proof.yml'})
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some(
      (node) => node.textContent === 'Copied to clipboard.',
    ),
  );
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    await block.locator('pre code').textContent(),
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
  });
  await block.getByRole('button').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some((node) =>
      node.textContent?.includes('Copy unavailable'),
    ),
  );
  await page.goto(`${origin}${base}`);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'Skip to content');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
  await page.getByRole('link', {name: 'Read the docs'}).click();
  await page.waitForURL(`**${base}docs/`);
  await page.getByRole('link', {name: 'Proof home'}).click();
  await page.waitForURL(`**${base}`);
  await context.close();

  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    viewport: {width: 390, height: 844},
  });
  const fallback = await noJS.newPage();
  await fallback.goto(`${origin}${base}docs/`);
  await fallback.locator('.mobile-nav summary').click();
  await fallback.locator('.mobile-nav a[href="#configuration"]').click();
  await fallback.waitForURL('**/#configuration');
  assert.equal(
    await fallback.locator('.code-header button:visible').count(),
    0,
  );
  assert.ok(await fallback.locator('#configuration').isVisible());
  await noJS.close();
  assert.deepEqual(errors, []);
  console.log(`Browser checks passed. Screenshots: ${screenshots}`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
