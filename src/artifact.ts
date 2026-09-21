import {copyFile, lstat, mkdir, readdir, realpath, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import type {ArtifactSummary} from './types.js';

const allowedDirectories = new Set([
  'assets',
  'blocks',
  'config',
  'layout',
  'locales',
  'sections',
  'snippets',
  'templates',
]);

export interface ArtifactLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const defaultArtifactLimits: ArtifactLimits = {
  maxFiles: 5_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
};

export async function prepareThemeArtifact(
  sourceRoot: string,
  destinationRoot: string,
  limits: ArtifactLimits = defaultArtifactLimits,
): Promise<ArtifactSummary> {
  assertLimits(limits);
  const source = await realDirectory(sourceRoot, 'theme directory');
  const destination = resolve(destinationRoot);
  if (
    destination === source ||
    isInside(source, destination) ||
    isInside(destination, source)
  ) {
    throw new Error(
      'staged artifact must not contain or be contained by the theme directory',
    );
  }
  await rm(destination, {recursive: true, force: true});
  await mkdir(destination, {recursive: true});
  const summary: ArtifactSummary = {root: destination, files: 0, bytes: 0};
  const entries = await readdir(source, {withFileTypes: true});
  for (const entry of entries) {
    if (!allowedDirectories.has(entry.name)) continue;
    const path = join(source, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(
        `Shopify theme directory must be a real directory: ${entry.name}`,
      );
    }
    await copyDirectory(
      path,
      join(destination, entry.name),
      source,
      summary,
      limits,
    );
  }
  await requireLayout(destination);
  if (summary.files === 0) throw new Error('theme artifact contains no files');
  return summary;
}

export async function validateThemeArtifact(
  configuredRoot: string,
  limits: ArtifactLimits = defaultArtifactLimits,
): Promise<ArtifactSummary> {
  assertLimits(limits);
  const root = await realDirectory(configuredRoot, 'theme-path');
  const topLevel = await readdir(root, {withFileTypes: true});
  for (const entry of topLevel) {
    if (!entry.isDirectory() || !allowedDirectories.has(entry.name)) {
      throw new Error(
        `theme artifact contains unsupported top-level entry: ${entry.name}`,
      );
    }
  }
  await requireLayout(root);
  const summary: ArtifactSummary = {root, files: 0, bytes: 0};
  for (const entry of topLevel) {
    await inspectDirectory(join(root, entry.name), root, summary, limits);
  }
  if (summary.files === 0) throw new Error('theme artifact contains no files');
  return summary;
}

async function copyDirectory(
  source: string,
  destination: string,
  root: string,
  summary: ArtifactSummary,
  limits: ArtifactLimits,
): Promise<void> {
  await mkdir(destination);
  const entries = await readdir(source, {withFileTypes: true});
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    const metadata = await lstat(sourcePath);
    const name = portablePath(root, sourcePath);
    if (metadata.isSymbolicLink()) {
      throw new Error(`theme artifact cannot contain symbolic links: ${name}`);
    }
    if (metadata.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath, root, summary, limits);
      continue;
    }
    inspectFile(metadata, name, summary, limits);
    await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  }
}

async function inspectDirectory(
  directory: string,
  root: string,
  summary: ArtifactSummary,
  limits: ArtifactLimits,
): Promise<void> {
  const entries = await readdir(directory, {withFileTypes: true});
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    const name = portablePath(root, path);
    if (metadata.isSymbolicLink()) {
      throw new Error(`theme artifact cannot contain symbolic links: ${name}`);
    }
    if (metadata.isDirectory()) {
      await inspectDirectory(path, root, summary, limits);
      continue;
    }
    inspectFile(metadata, name, summary, limits);
  }
}

function inspectFile(
  metadata: {isFile(): boolean; size: number},
  name: string,
  summary: ArtifactSummary,
  limits: ArtifactLimits,
): void {
  if (!metadata.isFile()) {
    throw new Error(
      `theme artifact contains an unsupported file type: ${name}`,
    );
  }
  summary.files += 1;
  summary.bytes += metadata.size;
  if (summary.files > limits.maxFiles) {
    throw new Error(`theme artifact exceeds the ${limits.maxFiles} file limit`);
  }
  if (metadata.size > limits.maxFileBytes) {
    throw new Error(`theme artifact file exceeds the size limit: ${name}`);
  }
  if (summary.bytes > limits.maxTotalBytes) {
    throw new Error('theme artifact exceeds the total size limit');
  }
}

async function requireLayout(root: string): Promise<void> {
  const layout = await lstat(join(root, 'layout', 'theme.liquid'));
  if (!layout.isFile() || layout.isSymbolicLink()) {
    throw new Error('layout/theme.liquid must be a regular file');
  }
}

async function realDirectory(path: string, name: string): Promise<string> {
  const unresolved = resolve(path);
  const metadata = await lstat(unresolved);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${name} must be a real directory, not a symbolic link`);
  }
  return realpath(unresolved);
}

function isInside(parent: string, child: string): boolean {
  const relationship = relative(parent, child);
  return (
    relationship !== '' &&
    relationship !== '..' &&
    !relationship.startsWith(`..${sep}`)
  );
}

function portablePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function assertLimits(limits: ArtifactLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
  }
}
