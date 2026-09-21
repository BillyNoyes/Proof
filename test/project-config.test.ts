import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadProjectConfig} from '../src/project-config.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, {recursive: true, force: true})),
  );
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'theme-proof-config-'));
  roots.push(root);
  return root;
}

describe('Theme Proof project config', () => {
  it('defaults to a no-build theme at the repository root', async () => {
    const root = await workspace();
    await expect(
      loadProjectConfig(root, 'theme-proof.config.json'),
    ).resolves.toEqual({
      workspace: root,
      workingDirectory: root,
      themeDirectory: root,
    });
  });

  it('resolves explicit commands and monorepo paths', async () => {
    const root = await workspace();
    await mkdir(join(root, 'themes/storefront'), {recursive: true});
    await writeFile(
      join(root, 'proof.json'),
      JSON.stringify({
        $schema: 'https://example.com/theme-proof.schema.json',
        version: 1,
        build: {
          workingDirectory: 'themes/storefront',
          setup: 'npm install --global pnpm',
          install: 'pnpm install --frozen-lockfile',
          command: 'pnpm build',
          themeDirectory: 'themes/storefront',
        },
      }),
    );
    await expect(loadProjectConfig(root, 'proof.json')).resolves.toEqual({
      configPath: join(root, 'proof.json'),
      workspace: root,
      workingDirectory: join(root, 'themes/storefront'),
      themeDirectory: join(root, 'themes/storefront'),
      setup: 'npm install --global pnpm',
      install: 'pnpm install --frozen-lockfile',
      command: 'pnpm build',
    });
  });

  it.each([
    {version: 2},
    {version: 1, unknown: true},
    {version: 1, build: {themeDirectory: '../outside'}},
    {version: 1, build: {workingDirectory: '/absolute'}},
  ])('rejects unsafe or unsupported config %#', async (config) => {
    const root = await workspace();
    await writeFile(join(root, 'proof.json'), JSON.stringify(config));
    await expect(loadProjectConfig(root, 'proof.json')).rejects.toThrow();
  });
});
