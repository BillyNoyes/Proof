import {readFile} from 'node:fs/promises';
import {isAbsolute, relative, resolve, sep} from 'node:path';

export interface BuildConfig {
  workingDirectory: string;
  themeDirectory: string;
  setup?: string;
  install?: string;
  command?: string;
}

export interface ProjectConfig {
  version: 1;
  build: BuildConfig;
}

export interface ResolvedBuildConfig {
  configPath?: string;
  workspace: string;
  workingDirectory: string;
  themeDirectory: string;
  setup?: string;
  install?: string;
  command?: string;
}

const defaults: ProjectConfig = {
  version: 1,
  build: {
    workingDirectory: '.',
    themeDirectory: '.',
  },
};

export async function loadProjectConfig(
  workspace: string,
  configuredPath: string,
): Promise<ResolvedBuildConfig> {
  const root = resolve(workspace);
  const requested = configuredPath.trim();
  if (requested === '') return resolveConfig(defaults, root);
  const configPath = inside(root, requested, 'config');
  let content: string;
  try {
    content = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isMissing(error) && requested === 'theme-proof.config.json') {
      return resolveConfig(defaults, root);
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(
      `Theme Proof config is not valid JSON: ${relative(root, configPath)}`,
    );
  }
  const config = validateConfig(value);
  return {...resolveConfig(config, root), configPath};
}

function validateConfig(value: unknown): ProjectConfig {
  const config = record(value, 'config');
  rejectUnknown(config, ['$schema', 'version', 'build'], 'config');
  if (config.version !== 1)
    throw new Error('Theme Proof config version must be 1');
  const build = record(config.build ?? {}, 'build');
  rejectUnknown(
    build,
    ['workingDirectory', 'themeDirectory', 'setup', 'install', 'command'],
    'build',
  );
  return {
    version: 1,
    build: {
      workingDirectory: optionalString(build.workingDirectory) ?? '.',
      themeDirectory: optionalString(build.themeDirectory) ?? '.',
      ...optionalCommand(build.setup, 'build.setup', 'setup'),
      ...optionalCommand(build.install, 'build.install'),
      ...optionalCommand(build.command, 'build.command', 'command'),
    },
  };
}

function resolveConfig(
  config: ProjectConfig,
  workspace: string,
): ResolvedBuildConfig {
  return {
    workspace,
    workingDirectory: inside(
      workspace,
      config.build.workingDirectory,
      'build.workingDirectory',
    ),
    themeDirectory: inside(
      workspace,
      config.build.themeDirectory,
      'build.themeDirectory',
    ),
    ...(config.build.setup ? {setup: config.build.setup} : {}),
    ...(config.build.install ? {install: config.build.install} : {}),
    ...(config.build.command ? {command: config.build.command} : {}),
  };
}

function inside(root: string, value: string, name: string): string {
  if (value === '' || isAbsolute(value)) {
    throw new Error(`${name} must be a non-empty relative path`);
  }
  const path = resolve(root, value);
  const relationship = relative(root, path);
  if (relationship === '..' || relationship.startsWith(`..${sep}`)) {
    throw new Error(`${name} cannot leave the GitHub workspace`);
  }
  return path;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: string[],
  name: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      throw new Error(`${name} contains unknown property: ${key}`);
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '')
    throw new Error('paths must be strings');
  return value;
}

function optionalCommand(
  value: unknown,
  name: string,
  property = 'install',
): Partial<Pick<BuildConfig, 'setup' | 'install' | 'command'>> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string')
    throw new Error(`${name} must be a string or null`);
  return {[property]: value};
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as {code?: unknown}).code === 'ENOENT'
  );
}
