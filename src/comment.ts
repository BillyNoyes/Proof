import type {PreviewState} from './types.js';

const markerPattern = /<!-- theme-proof-state:([A-Za-z0-9_-]+) -->/;

export function renderPreviewComment(
  state: PreviewState,
  strict = true,
): string {
  return [
    '## Theme Proof',
    '',
    `Preview updated for \`${escapeCode(state.sha.slice(0, 12))}\`.`,
    '',
    `[Storefront preview](${state.previewUrl}) · [Theme Editor](${state.editorUrl})`,
    '',
    `Theme Check: ${strict ? 'passed' : 'not run'}`,
    `Context: \`${escapeCode(state.context)}\``,
    '',
    marker(state),
  ].join('\n');
}

export function renderRemovedComment(state: PreviewState): string {
  return [
    '## Theme Proof',
    '',
    'Preview removed because this pull request was closed.',
    '',
    `Last deployed commit: \`${escapeCode(state.sha.slice(0, 12))}\``,
    '',
    marker(state),
  ].join('\n');
}

export function readPreviewState(body: string): PreviewState | undefined {
  const encoded = markerPattern.exec(body)?.[1];
  if (!encoded) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Theme Proof comment contains invalid state');
  }
  return validateState(value);
}

function marker(state: PreviewState): string {
  return `<!-- theme-proof-state:${Buffer.from(JSON.stringify(state)).toString('base64url')} -->`;
}

function validateState(value: unknown): PreviewState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Theme Proof comment contains invalid state');
  }
  const state = value as Record<string, unknown>;
  if (
    state.schemaVersion !== 1 ||
    typeof state.repository !== 'string' ||
    typeof state.pullRequest !== 'number' ||
    !Number.isSafeInteger(state.pullRequest) ||
    state.pullRequest <= 0 ||
    typeof state.context !== 'string' ||
    typeof state.store !== 'string' ||
    typeof state.themeId !== 'string' ||
    typeof state.previewUrl !== 'string' ||
    typeof state.editorUrl !== 'string' ||
    typeof state.sha !== 'string' ||
    !/^[1-9]\d*$/.test(state.themeId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(state.context) ||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(state.store)
  ) {
    throw new Error('Theme Proof comment contains invalid state');
  }
  return state as unknown as PreviewState;
}

function escapeCode(value: string): string {
  return value.replaceAll('`', '\\`');
}
