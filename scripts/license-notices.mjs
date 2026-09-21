import {readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {format} from 'prettier';

const packages = new Set();
for (const bundle of ['action', 'build-action']) {
  const map = JSON.parse(await readFile(`dist/${bundle}.cjs.map`, 'utf8'));
  for (const source of map.sources) {
    const directory = source.match(
      /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//,
    )?.[1];
    if (directory) packages.add(resolve('dist', directory));
  }
}
const notices = [];
for (const directory of packages) {
  const metadata = JSON.parse(
    await readFile(resolve(directory, 'package.json'), 'utf8'),
  );
  const licenseFile = (await readdir(directory)).find((name) =>
    /^licen[sc]e(?:\.(?:md|txt))?$/i.test(name),
  );
  if (!licenseFile)
    throw new Error(`Missing bundled license: ${metadata.name}`);
  const license = await readFile(resolve(directory, licenseFile), 'utf8');
  notices.push({
    name: metadata.name,
    text: `## ${metadata.name} ${metadata.version}\n\n${license.trim()}\n`,
  });
}
notices.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const document =
  '# Third-party notices\n\nThe committed GitHub Action bundles include the following dependencies. Their license terms and notices are reproduced below. Site font licensing is documented separately in `site/ASSETS.md`.\n\n' +
  notices.map((notice) => notice.text).join('\n');
await writeFile(
  'THIRD_PARTY_NOTICES.md',
  await format(document, {parser: 'markdown'}),
);
console.log(`Recorded licenses for ${notices.length} bundled dependencies.`);
