import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for (const file of ['dist/action.js', 'dist/build-action.js']) {
  const output = await readFile(file, 'utf8');
  assert.doesNotMatch(output, /from ["']@actions\/core["']/);
}
assert.match(await readFile('dist/action.js', 'utf8'), /Theme Proof/);
console.log('Verified self-contained GitHub Action bundles.');
