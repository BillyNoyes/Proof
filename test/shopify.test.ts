import {describe, expect, it, vi} from 'vitest';
import {
  parseThemePreview,
  ShopifyClient,
  type CommandRunner,
} from '../src/shopify.js';

const store = 'example.myshopify.com';
const output = JSON.stringify({
  theme: {
    id: 123456789,
    name: 'proof-123-42',
    role: 'development',
    shop: store,
    editor_url: `https://${store}/admin/themes/123456789/editor`,
    preview_url: `https://${store}/?preview_theme_id=123456789`,
  },
});

describe('Shopify CLI integration', () => {
  it('parses and validates machine-readable preview output', () => {
    expect(parseThemePreview(output, store)).toEqual({
      id: '123456789',
      name: 'proof-123-42',
      role: 'development',
      shop: store,
      editorUrl: `https://${store}/admin/themes/123456789/editor`,
      previewUrl: `https://${store}/?preview_theme_id=123456789`,
    });
  });

  it('rejects live themes, other stores, and mismatched links', () => {
    expect(() =>
      parseThemePreview(output.replace('development', 'live'), store),
    ).toThrow('development theme');
    expect(() =>
      parseThemePreview(output.replace('development', 'unpublished'), store),
    ).toThrow('development theme');
    expect(() => parseThemePreview(output, 'other.myshopify.com')).toThrow(
      'different store',
    );
    expect(() =>
      parseThemePreview(output.replaceAll('123456789', '987654321'), store),
    ).not.toThrow();
    expect(() =>
      parseThemePreview(
        output.replace('preview_theme_id=123456789', 'preview_theme_id=1'),
        store,
      ),
    ).toThrow('mismatched preview URL');
    expect(() =>
      parseThemePreview(
        output.replace('/themes/123456789/editor', '/themes/1/editor'),
        store,
      ),
    ).toThrow('mismatched Theme Editor URL');
  });

  it('accepts strict-push Theme Check output before the preview document', () => {
    expect(parseThemePreview(`[]\n${output}\n`, store).id).toBe('123456789');
    expect(
      parseThemePreview(
        `${JSON.stringify([{errorCount: 0, offenses: [{severity: 'warning'}]}])}\n${output}`,
        store,
      ).id,
    ).toBe('123456789');
    expect(() =>
      parseThemePreview(`[ {"errorCount": 1} ]\n${output}`, store),
    ).toThrow();
    expect(() => parseThemePreview(`unexpected\n${output}`, store)).toThrow();
  });

  it.each([
    {warning: 'partial upload'},
    {errors: {'assets/theme.css': ['invalid']}},
  ])('fails partial uploads even with exit zero: %j', (failure) => {
    const value = JSON.parse(output) as {theme: Record<string, unknown>};
    Object.assign(value.theme, failure);
    expect(() => parseThemePreview(JSON.stringify(value), store)).toThrow(
      'upload errors',
    );
  });

  it.each([
    '/themes/123456789/editor-extra',
    '/themes/123456789/editor/elsewhere',
  ])('rejects misleading editor paths %s', (path) => {
    expect(() =>
      parseThemePreview(
        output.replace('/themes/123456789/editor', path),
        store,
      ),
    ).toThrow();
  });

  it('passes credentials through the environment, never arguments', async () => {
    const runner = vi.fn<CommandRunner>((_command, args, options) => {
      expect(args).not.toContain('secret-password');
      expect(options.env.SHOPIFY_CLI_THEME_TOKEN).toBe('secret-password');
      expect(options.env.SHOPIFY_FLAG_STORE).toBe(store);
      if (args[0] === 'version') {
        return Promise.resolve({code: 0, stdout: '4.8.0\n', stderr: ''});
      }
      return Promise.resolve({code: 0, stdout: output, stderr: ''});
    });
    const client = new ShopifyClient({
      command: 'shopify',
      store,
      password: 'secret-password',
      runner,
    });
    await expect(client.verifyVersion()).resolves.toBe('4.8.0');
    await expect(
      client.pushPreview({
        path: '/theme',
        context: 'proof-123-42',
        strict: true,
      }),
    ).resolves.toMatchObject({id: '123456789'});
    expect(runner).toHaveBeenLastCalledWith(
      'shopify',
      [
        'theme',
        'push',
        '--path',
        '/theme',
        '--development',
        '--development-context',
        'proof-123-42',
        '--json',
        '--strict',
      ],
      expect.objectContaining({cwd: '/theme'}),
    );
  });

  it('rejects old CLI versions and redacts secrets from errors', async () => {
    const oldRunner: CommandRunner = () =>
      Promise.resolve({
        code: 0,
        stdout: '4.5.0',
        stderr: '',
      });
    const old = new ShopifyClient({
      command: 'shopify',
      store,
      password: 'secret',
      runner: oldRunner,
    });
    await expect(old.verifyVersion()).rejects.toThrow('4.8.0 or newer');

    const failedRunner: CommandRunner = () =>
      Promise.resolve({
        code: 1,
        stdout: '',
        stderr: 'credential secret was rejected',
      });
    const failed = new ShopifyClient({
      command: 'shopify',
      store,
      password: 'secret',
      runner: failedRunner,
    });
    await expect(failed.verifyVersion()).rejects.toThrow(
      'credential [redacted] was rejected',
    );
  });
});
