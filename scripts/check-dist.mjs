import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for (const file of ['dist/action.cjs', 'dist/build-action.cjs']) {
  const output = await readFile(file, 'utf8');
  assert.doesNotMatch(output, /(?:from|require\()[ "']+@actions\/core/);
}
assert.match(await readFile('dist/action.cjs', 'utf8'), /Theme Proof/);
console.log('Verified self-contained GitHub Action bundles.');
