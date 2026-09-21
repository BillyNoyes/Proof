import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const output = fileURLToPath(new URL('../dist/', import.meta.url));
const base = process.env.SITE_BASE_PATH || '/Proof/';
const origin = 'https://example.test';

for (const page of ['index.html', 'docs/index.html']) {
  const html = await readFile(resolve(output, page), 'utf8');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${page}: one h1`);
  assert.match(html, /name="description"/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /Skip to content/);
  assert.doesNotMatch(html, /%BASE_URL%|\/src\/|@v1/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page}: duplicate IDs`);
  const pageUrl = new URL(base + page.replace(/index\.html$/, ''), origin);
  for (const [, value] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(value, pageUrl);
    if (url.origin !== origin) continue;
    assert.ok(
      url.pathname.startsWith(base),
      `Link escapes Pages base: ${value}`,
    );
    const relative = url.pathname.slice(base.length);
    const path = resolve(
      output,
      relative.endsWith('/') || !relative ? relative + 'index.html' : relative,
    );
    assert.ok((await stat(path)).isFile(), `Missing ${value}`);
    if (url.hash) {
      const target = await readFile(path, 'utf8');
      assert.ok(
        target.includes(`id="${url.hash.slice(1)}"`),
        `Missing fragment ${value}`,
      );
    }
  }
  for (const [, json] of html.matchAll(/<code>(\{[\s\S]*?)<\/code>/g)) {
    const config = JSON.parse(
      json.replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    );
    assert.equal(config.version, 1);
    assert.ok(config.build);
  }
}

const docs = await readFile(resolve(output, 'docs/index.html'), 'utf8');
const workflow = await readFile(
  new URL('../../.github/workflows/preview.yml', import.meta.url),
  'utf8',
);
for (const setting of [
  'SHOPIFY_CLI_THEME_TOKEN',
  'SHOPIFY_FLAG_STORE',
  'development-context',
  '4.8.0',
]) {
  assert.ok(
    docs.includes(setting) && workflow.includes(setting),
    `Documentation drift: ${setting}`,
  );
}
console.log(
  `Verified both pages, local assets, fragments, JSON examples, and workflow settings at ${base}.`,
);
