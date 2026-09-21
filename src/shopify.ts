import {spawn} from 'node:child_process';
import {stopProcessTree} from './process.js';
import type {ThemePreview} from './types.js';

const minimumCliVersion = [4, 8, 0] as const;
const maxOutputBytes = 1_000_000;

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: {cwd?: string; env: NodeJS.ProcessEnv; timeoutMs: number},
) => Promise<CommandResult>;

export interface ShopifyClientOptions {
  command: string;
  store: string;
  password: string;
  runner?: CommandRunner;
}

export class ShopifyClient {
  readonly #command: string;
  readonly #store: string;
  readonly #password: string;
  readonly #runner: CommandRunner;

  constructor(options: ShopifyClientOptions) {
    this.#command = options.command;
    this.#store = options.store;
    this.#password = options.password;
    this.#runner = options.runner ?? runCommand;
  }

  async verifyVersion(): Promise<string> {
    const result = await this.#run(['version'], undefined, 30_000);
    const version = /\b(\d+)\.(\d+)\.(\d+)\b/
      .exec(result.stdout)
      ?.slice(1)
      .map(Number);
    if (!version || version.length !== 3) {
      throw new Error('could not determine the Shopify CLI version');
    }
    if (compareVersion(version, minimumCliVersion) < 0) {
      throw new Error(
        `Shopify CLI ${minimumCliVersion.join('.')} or newer is required`,
      );
    }
    return version.join('.');
  }

  async pushPreview(options: {
    path: string;
    context: string;
    strict: boolean;
  }): Promise<ThemePreview> {
    const args = [
      'theme',
      'push',
      '--path',
      options.path,
      '--development',
      '--development-context',
      options.context,
      '--json',
    ];
    if (options.strict) args.push('--strict');
    const result = await this.#run(args, options.path, 10 * 60_000);
    const theme = parseThemePreview(result.stdout, this.#store);
    if (theme.name !== options.context) {
      throw new Error('Shopify CLI returned a different development context');
    }
    return theme;
  }

  async deleteTheme(
    themeId: string | undefined,
    context: string,
  ): Promise<void> {
    if (themeId !== undefined && !/^[1-9]\d*$/.test(themeId))
      throw new Error('theme ID must be a positive integer');
    const themes = await this.#listThemes();
    const matches = themes.filter((item) =>
      themeId === undefined ? item.name === context : item.id === themeId,
    );
    if (matches.length > 1) throw new Error('development context is ambiguous');
    const theme = matches[0];
    if (!theme) return;
    if (theme.role !== 'development' || theme.name !== context) {
      throw new Error(
        'refusing to delete a theme outside this development context',
      );
    }
    await this.#run(
      ['theme', 'delete', '--theme', theme.id, '--force', '--no-color'],
      undefined,
      5 * 60_000,
    );
    if ((await this.#listThemes()).some((item) => item.id === theme.id)) {
      throw new Error('Shopify CLI did not remove the preview theme');
    }
  }

  async #listThemes(): Promise<{id: string; name: string; role: string}[]> {
    // Filtering by ID makes the CLI fail on a missing theme instead of returning [].
    const result = await this.#run(
      ['theme', 'list', '--json'],
      undefined,
      60_000,
    );
    const value: unknown = JSON.parse(result.stdout);
    if (!Array.isArray(value))
      throw new Error('Shopify CLI returned invalid theme list');
    return value.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error('Shopify CLI returned invalid theme list');
      }
      const data = item as Record<string, unknown>;
      return {
        id: themeId(data.id),
        name: requiredString(data.name, 'theme.name'),
        role: requiredString(data.role, 'theme.role'),
      };
    });
  }

  async #run(args: string[], cwd: string | undefined, timeoutMs: number) {
    const inherited = {...process.env};
    // CLI environment flags can override target selection or publish a preview.
    for (const name of Object.keys(inherited)) {
      if (
        /^(SHOPIFY_|INPUT_)/i.test(name) ||
        /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)(?:_|$)/i.test(
          name,
        )
      ) {
        delete inherited[name];
      }
    }
    const env: NodeJS.ProcessEnv = {
      ...inherited,
      CI: 'true',
      SHOPIFY_CLI_THEME_TOKEN: this.#password,
      SHOPIFY_FLAG_STORE: this.#store,
      SHOPIFY_FLAG_FORCE: '1',
      SHOPIFY_FLAG_NO_UPDATE: '1',
    };
    const options: {cwd?: string; env: NodeJS.ProcessEnv; timeoutMs: number} = {
      env,
      timeoutMs,
    };
    if (cwd !== undefined) options.cwd = cwd;
    const result = await this.#runner(this.#command, args, options);
    if (result.code !== 0) {
      throw new Error(
        redact(
          `Shopify CLI failed (${result.code}): ${result.stderr}`,
          this.#password,
        ),
      );
    }
    return result;
  }
}

export function parseThemePreview(
  stdout: string,
  expectedStore: string,
): ThemePreview {
  let value: unknown;
  try {
    value = parsePushOutput(stdout);
  } catch {
    throw new Error('Shopify CLI returned invalid JSON');
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('Shopify CLI returned invalid theme data');
  }
  const theme = (value as {theme?: unknown}).theme;
  if (typeof theme !== 'object' || theme === null) {
    throw new Error('Shopify CLI returned invalid theme data');
  }
  const data = theme as Record<string, unknown>;
  if (data.warning !== undefined || data.errors !== undefined) {
    throw new Error('Shopify CLI reported theme upload errors');
  }
  const id = themeId(data.id);
  const name = requiredString(data.name, 'theme.name');
  const role = requiredString(data.role, 'theme.role');
  const shop = requiredString(data.shop, 'theme.shop').toLowerCase();
  const editorUrl = validatedUrl(data.editor_url, 'theme.editor_url');
  const previewUrl = validatedUrl(data.preview_url, 'theme.preview_url');
  if (shop !== expectedStore)
    throw new Error('Shopify CLI returned a different store');
  if (role !== 'development') {
    throw new Error('Shopify CLI did not return a development theme');
  }
  if (previewUrl.hostname !== expectedStore) {
    throw new Error('Shopify CLI returned a preview URL for a different store');
  }
  if (previewUrl.searchParams.get('preview_theme_id') !== id) {
    throw new Error('Shopify CLI returned a mismatched preview URL');
  }
  if (
    ![expectedStore, 'admin.shopify.com'].includes(editorUrl.hostname) ||
    ![
      `/admin/themes/${id}/editor`,
      `/store/${expectedStore.replace(/\.myshopify\.com$/, '')}/themes/${id}/editor`,
    ].includes(editorUrl.pathname)
  ) {
    throw new Error('Shopify CLI returned a mismatched Theme Editor URL');
  }
  return {
    id,
    name,
    role,
    shop,
    editorUrl: editorUrl.href,
    previewUrl: previewUrl.href,
  };
}

function parsePushOutput(stdout: string): unknown {
  const text = stdout.trim();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Strict pushes print a Theme Check array before the final single-line theme JSON.
    const lines = text.split(/\r?\n/);
    const preview = lines.pop();
    const checks: unknown = JSON.parse(lines.join('\n'));
    if (!Array.isArray(checks) || !preview)
      throw new Error('invalid push output');
    for (const check of checks as unknown[]) {
      if (typeof check !== 'object' || check === null)
        throw new Error('invalid checks');
      const result = check as Record<string, unknown>;
      if (result.errorCount !== 0 || !Array.isArray(result.offenses)) {
        throw new Error('Theme Check did not pass');
      }
    }
    return JSON.parse(preview) as unknown;
  }
}

export const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        stopProcessTree(child);
        clearTimeout(timeout);
        reject(new Error('Shopify CLI output exceeded the safety limit'));
        return;
      }
      if (target === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
    };
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.once('error', reject);
    const timeout = setTimeout(() => {
      stopProcessTree(child);
      reject(new Error('Shopify CLI timed out'));
    }, options.timeoutMs);
    timeout.unref();
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolve({code: code ?? 1, stdout, stderr});
    });
  });

function compareVersion(left: number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function themeId(value: unknown): string {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  throw new Error('Shopify CLI returned an invalid theme ID');
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '')
    throw new Error(`${name} is invalid`);
  return value;
}

function validatedUrl(value: unknown, name: string): URL {
  const url = new URL(requiredString(value, name));
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error(`${name} must be a credential-free HTTPS URL`);
  }
  return url;
}

function redact(value: string, secret: string): string {
  return secret === '' ? value : value.replaceAll(secret, '[redacted]');
}
