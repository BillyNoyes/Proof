import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {prepareThemeArtifact, validateThemeArtifact} from '../src/artifact.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, {recursive: true, force: true})),
  );
});

async function theme(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'theme-proof-artifact-'));
  roots.push(root);
  await mkdir(join(root, 'layout'));
  await mkdir(join(root, 'assets'));
  await writeFile(
    join(root, 'layout/theme.liquid'),
    '{{ content_for_layout }}',
  );
  await writeFile(join(root, 'assets/theme.css'), 'body {}');
  return root;
}

describe('theme artifact validation', () => {
  it('accepts a minimal theme and reports its size', async () => {
    const root = await theme();
    const result = await validateThemeArtifact(root);
    await expect(realpath(root)).resolves.toBe(result.root);
    expect(result.files).toBe(2);
    expect(result.bytes).toBeGreaterThan(10);
  });

  it('stages only Shopify theme directories from a no-build repository', async () => {
    const root = await theme();
    const destination = `${root}-staged`;
    roots.push(destination);
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/main.js'), 'console.log("source")');
    await writeFile(join(root, 'package.json'), '{}');
    const result = await prepareThemeArtifact(root, destination);
    expect(result.root).toBe(destination);
    await expect(
      lstat(join(destination, 'package.json')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(lstat(join(destination, 'src'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      lstat(join(destination, 'layout/theme.liquid')),
    ).resolves.toBeDefined();
  });

  it('rejects files outside Shopify theme directories', async () => {
    const root = await theme();
    await writeFile(join(root, 'package.json'), '{}');
    await expect(validateThemeArtifact(root)).rejects.toThrow(
      'unsupported top-level entry: package.json',
    );
  });

  it.skipIf(process.platform === 'win32')(
    'rejects symbolic links',
    async () => {
      const root = await theme();
      await symlink(
        join(root, 'layout/theme.liquid'),
        join(root, 'assets/copied.liquid'),
      );
      await expect(validateThemeArtifact(root)).rejects.toThrow(
        'symbolic links',
      );
    },
  );

  it('enforces file and byte limits', async () => {
    const root = await theme();
    await expect(
      validateThemeArtifact(root, {
        maxFiles: 1,
        maxFileBytes: 1_000,
        maxTotalBytes: 1_000,
      }),
    ).rejects.toThrow('file limit');
    await expect(
      validateThemeArtifact(root, {
        maxFiles: 10,
        maxFileBytes: 3,
        maxTotalBytes: 1_000,
      }),
    ).rejects.toThrow('file exceeds the size limit');
  });
});
