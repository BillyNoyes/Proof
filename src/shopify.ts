import {spawn} from 'node:child_process';
import type {ThemePreview} from './types.js';

const minimumCliVersion = [4, 6, 1] as const;
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
      '--development-context',
      options.context,
      '--json',
    ];
    if (options.strict) args.push('--strict');
    const result = await this.#run(args, options.path, 10 * 60_000);
    return parseThemePreview(result.stdout, this.#store);
  }

  async deleteTheme(themeId: string): Promise<void> {
    if (!/^\d+$/.test(themeId))
      throw new Error('theme ID must contain only digits');
    await this.#run(
      ['theme', 'delete', '--theme', themeId, '--force', '--no-color'],
      undefined,
      5 * 60_000,
    );
  }

  async #run(args: string[], cwd: string | undefined, timeoutMs: number) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
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
    value = JSON.parse(stdout.trim());
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
    !editorUrl.pathname.includes(`/themes/${id}/editor`)
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

export const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        child.kill();
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
      child.kill();
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
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
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
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
  return url;
}

function redact(value: string, secret: string): string {
  return secret === '' ? value : value.replaceAll(secret, '[redacted]');
}
