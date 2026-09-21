import {describe, expect, it} from 'vitest';
import {
  readPreviewState,
  renderPreviewComment,
  renderRemovedComment,
} from '../src/comment.js';
import type {PreviewState} from '../src/types.js';

const state: PreviewState = {
  schemaVersion: 1,
  repository: 'BillyNoyes/Proof',
  pullRequest: 42,
  context: 'proof-123-42',
  store: 'example.myshopify.com',
  themeId: '123456789',
  previewUrl: 'https://example.myshopify.com/?preview_theme_id=123456789',
  editorUrl: 'https://example.myshopify.com/admin/themes/123456789/editor',
  sha: 'abcdef1234567890',
};

describe('pull request comments', () => {
  it('round trips trusted preview state', () => {
    const body = renderPreviewComment(state);
    expect(body).toContain('Storefront preview');
    expect(body).toContain('Theme Editor');
    expect(body).toContain('abcdef123456');
    expect(readPreviewState(body)).toEqual(state);
  });

  it('renders removal without exposing credentials', () => {
    const body = renderRemovedComment(state);
    expect(body).toContain('Preview removed');
    expect(body).not.toContain('password');
    expect(readPreviewState(body)).toEqual(state);
  });

  it('rejects malformed markers', () => {
    expect(() =>
      readPreviewState('<!-- theme-proof-state:not-json -->'),
    ).toThrow('invalid state');
    expect(readPreviewState('ordinary comment')).toBeUndefined();
  });
});
