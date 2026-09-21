import {afterEach, describe, expect, it, vi} from 'vitest';
import {ShopifyClient, type CommandRunner} from '../src/shopify.js';

const context = 'proof-123-42';
const development = {id: 123, name: context, role: 'development'};
const options = {
  command: 'shopify',
  store: 'example.myshopify.com',
  password: 'secret',
};

afterEach(() => vi.unstubAllEnvs());

function setup(responses: unknown[]) {
  const runner = vi.fn<CommandRunner>(() =>
    Promise.resolve({
      code: 0,
      stdout: JSON.stringify(responses.shift()),
      stderr: '',
    }),
  );
  return {runner, client: new ShopifyClient({...options, runner})};
}

describe('safe cleanup', () => {
  it('checks role and context before deletion and verifies removal', async () => {
    const {client, runner} = setup([[development], {}, []]);
    await client.deleteTheme('123', context);
    expect(runner.mock.calls.map(([, args]) => args)).toEqual([
      ['theme', 'list', '--json'],
      ['theme', 'delete', '--theme', '123', '--force', '--no-color'],
      ['theme', 'list', '--json'],
    ]);
  });

  it.each([
    {...development, role: 'live'},
    {...development, role: 'unpublished'},
    {...development, name: 'proof-123-99'},
  ])('refuses to delete another context or role: %j', async (theme) => {
    const {client, runner} = setup([[theme]]);
    await expect(client.deleteTheme('123', context)).rejects.toThrow(
      'refusing to delete',
    );
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('treats an expired or previously deleted preview as successful cleanup', async () => {
    const {client, runner} = setup([[], []]);
    await client.deleteTheme('123', context);
    await client.deleteTheme('123', context);
    expect(runner.mock.calls.every(([, args]) => args[1] === 'list')).toBe(
      true,
    );
  });

  it('recovers a preview whose state comment could not be posted', async () => {
    const {client, runner} = setup([[development], {}, []]);
    await client.deleteTheme(undefined, context);
    expect(runner.mock.calls[1]?.[1]).toContain('123');
  });

  it('rejects ambiguous context names rather than guessing a theme', async () => {
    const {client, runner} = setup([[development, {...development, id: 456}]]);
    await expect(client.deleteTheme(undefined, context)).rejects.toThrow(
      'ambiguous',
    );
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('does not mistake authentication errors for missing themes', async () => {
    const runner = vi.fn<CommandRunner>(() =>
      Promise.resolve({code: 1, stdout: '', stderr: 'Unauthorized'}),
    );
    await expect(
      new ShopifyClient({...options, runner}).deleteTheme('123', context),
    ).rejects.toThrow('Unauthorized');
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed lists and deletions that did not remove the theme', async () => {
    await expect(
      setup([{}]).client.deleteTheme('123', context),
    ).rejects.toThrow('invalid theme list');
    await expect(
      setup([[development], {}, [development]]).client.deleteTheme(
        '123',
        context,
      ),
    ).rejects.toThrow('did not remove');
  });

  it('removes inherited publishing flags and unrelated credentials', async () => {
    for (const name of [
      'SHOPIFY_FLAG_PUBLISH',
      'SHOPIFY_FLAG_LIVE',
      'SHOPIFY_FLAG_THEME_ID',
      'SHOPIFY_FLAG_ENVIRONMENT',
      'INPUT_GITHUB-TOKEN',
      'GITHUB_TOKEN',
    ])
      vi.stubEnv(name, 'unsafe');
    const {client, runner} = setup([[]]);
    await client.deleteTheme('123', context);
    const env = runner.mock.calls[0]?.[2].env;
    expect(env).toMatchObject({
      SHOPIFY_CLI_THEME_TOKEN: 'secret',
      SHOPIFY_FLAG_STORE: options.store,
      CI: 'true',
    });
    for (const name of [
      'SHOPIFY_FLAG_PUBLISH',
      'SHOPIFY_FLAG_LIVE',
      'SHOPIFY_FLAG_THEME_ID',
      'SHOPIFY_FLAG_ENVIRONMENT',
      'INPUT_GITHUB-TOKEN',
      'GITHUB_TOKEN',
    ])
      expect(env?.[name]).toBeUndefined();
  });
});
