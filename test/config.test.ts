import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  normalizeStore,
  parseBoolean,
  readRepositoryContext,
  resolvePreviewContext,
} from '../src/config.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, {recursive: true, force: true})),
  );
});

describe('action configuration', () => {
  it.each([
    ['example.myshopify.com', 'example.myshopify.com'],
    ['https://EXAMPLE.myshopify.com/', 'example.myshopify.com'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeStore(input)).toBe(expected);
  });

  it.each([
    'example.com',
    'https://example.myshopify.com/path',
    'evil.myshopify.com.test',
  ])('rejects invalid store %s', (store) =>
    expect(() => normalizeStore(store)).toThrow('myshopify.com'),
  );

  it('creates stable and bounded contexts', () => {
    expect(resolvePreviewContext('', 123, 42)).toBe('proof-123-42');
    expect(resolvePreviewContext('release.preview-42', 123, 42)).toBe(
      'release.preview-42',
    );
    const long = resolvePreviewContext('spaces and '.repeat(20), 123, 42);
    expect(long).toMatch(/^proof-123-42-[a-f0-9]{20}$/);
    expect(long.length).toBeLessThanOrEqual(64);
  });

  it('parses strict booleans', () => {
    expect(parseBoolean('true', 'strict')).toBe(true);
    expect(parseBoolean('false', 'strict')).toBe(false);
    expect(() => parseBoolean('yes', 'strict')).toThrow('true or false');
  });

  it('rejects fork pull requests even with a privileged token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'theme-proof-fork-'));
    roots.push(root);
    const path = join(root, 'event.json');
    await writeFile(
      path,
      JSON.stringify({
        repository: {
          id: 123,
          full_name: 'owner/theme',
          owner: {login: 'owner'},
        },
        pull_request: {number: 42, head: {sha: 'abc123', repo: {id: 999}}},
      }),
    );
    await expect(readRepositoryContext(path, '')).rejects.toThrow(
      'fork pull requests',
    );
  });

  it('reads and verifies pull request identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'theme-proof-event-'));
    roots.push(root);
    const path = join(root, 'event.json');
    await writeFile(
      path,
      JSON.stringify({
        repository: {
          id: 123,
          full_name: 'BillyNoyes/Proof',
          owner: {login: 'BillyNoyes'},
        },
        pull_request: {number: 42, head: {sha: 'abc123', repo: {id: 123}}},
      }),
    );
    await expect(readRepositoryContext(path, '42')).resolves.toEqual({
      owner: 'BillyNoyes',
      repository: 'Proof',
      fullName: 'BillyNoyes/Proof',
      repositoryId: 123,
      pullRequest: 42,
      sha: 'abc123',
    });
    await expect(readRepositoryContext(path, '41')).rejects.toThrow(
      'does not match',
    );
  });
});
