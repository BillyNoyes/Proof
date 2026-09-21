import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {RepositoryContext} from './types.js';

const contextPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const storePattern = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeStore(value: string): string {
  let store = value.trim().toLowerCase();
  if (store.startsWith('https://')) store = store.slice('https://'.length);
  if (store.endsWith('/')) store = store.slice(0, -1);
  if (!storePattern.test(store)) {
    throw new Error('store must be a full myshopify.com domain');
  }
  return store;
}

export function resolvePreviewContext(
  configured: string,
  repositoryId: number,
  pullRequest: number,
): string {
  const value = configured.trim() || `proof-${repositoryId}-${pullRequest}`;
  if (contextPattern.test(value) && value.length <= 64) return value;
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 20);
  return `proof-${repositoryId}-${pullRequest}-${digest}`.slice(0, 64);
}

export function parseBoolean(value: string, name: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export async function readRepositoryContext(
  eventPath: string,
  pullRequestInput: string,
): Promise<RepositoryContext> {
  const value: unknown = JSON.parse(await readFile(eventPath, 'utf8'));
  const event = object(value, 'GitHub event');
  const repository = object(event.repository, 'repository');
  const owner = object(repository.owner, 'repository.owner');
  const pullRequest = object(event.pull_request, 'pull_request');
  const head = object(pullRequest.head, 'pull_request.head');
  const fullName = string(repository.full_name, 'repository.full_name');
  const [ownerName, repositoryName] = fullName.split('/');
  if (
    !ownerName ||
    !repositoryName ||
    ownerName !== string(owner.login, 'owner.login')
  ) {
    throw new Error('GitHub event contains an invalid repository identity');
  }
  const eventNumber = integer(pullRequest.number, 'pull_request.number');
  const configuredNumber = pullRequestInput.trim();
  const pullRequestNumber = configuredNumber
    ? positiveInteger(configuredNumber, 'pull-request-number')
    : eventNumber;
  if (pullRequestNumber !== eventNumber) {
    throw new Error('pull-request-number does not match the GitHub event');
  }
  return {
    owner: ownerName,
    repository: repositoryName,
    fullName,
    repositoryId: integer(repository.id, 'repository.id'),
    pullRequest: pullRequestNumber,
    sha: string(head.sha, 'pull_request.head.sha'),
  };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} is missing or invalid`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${name} is missing or invalid`);
  }
  return value;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} is missing or invalid`);
  }
  return value;
}

function positiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value))
    throw new Error(`${name} must be a positive integer`);
  return integer(Number(value), name);
}
