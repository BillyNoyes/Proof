import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {runPreview} from '../src/preview.js';
import {readPreviewState} from '../src/comment.js';
import type {PreviewState, ThemePreview} from '../src/types.js';

const repository = {
  owner: 'owner',
  repository: 'theme',
  fullName: 'owner/theme',
  repositoryId: 123,
  pullRequest: 42,
  sha: 'abc123',
};
const options = {
  repository,
  mode: 'deploy' as const,
  store: 'example.myshopify.com',
  context: 'proof-123-42',
  themePath: fileURLToPath(new URL('./fixtures/theme', import.meta.url)),
  strict: true,
};
const theme: ThemePreview = {
  id: '123',
  name: options.context,
  role: 'development',
  shop: options.store,
  previewUrl: `https://${options.store}/?preview_theme_id=123`,
  editorUrl: `https://${options.store}/admin/themes/123/editor`,
};
const state: PreviewState = {
  schemaVersion: 1,
  repository: repository.fullName,
  pullRequest: 42,
  context: options.context,
  store: options.store,
  themeId: theme.id,
  previewUrl: theme.previewUrl,
  editorUrl: theme.editorUrl,
  sha: repository.sha,
};

function clients(
  current = {state: 'open' as 'open' | 'closed', sha: repository.sha},
  existing?: PreviewState,
) {
  return {
    github: {
      currentPullRequest: vi.fn().mockResolvedValue(current),
      findProofComment: vi
        .fn()
        .mockResolvedValue(
          existing ? {comment: {id: 1}, state: existing} : undefined,
        ),
      upsertComment: vi.fn().mockResolvedValue(undefined),
    },
    shopify: {
      pushPreview: vi.fn().mockResolvedValue(theme),
      deleteTheme: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('preview lifecycle', () => {
  it('deploys the validated artifact and records the actual head SHA', async () => {
    const deps = clients();
    expect(await runPreview(options, deps)).toEqual({
      status: 'deployed',
      theme,
    });
    expect(deps.shopify.pushPreview).toHaveBeenCalledWith(
      expect.objectContaining({context: options.context, strict: true}),
    );
    expect(
      readPreviewState(String(deps.github.upsertComment.mock.calls[0]?.[0])),
    ).toEqual(state);
  });

  it.each([
    {state: 'open' as const, sha: 'newer'},
    {state: 'closed' as const, sha: repository.sha},
  ])('skips stale or closed deployments: %j', async (current) => {
    const deps = clients(current);
    expect(await runPreview(options, deps)).toMatchObject({status: 'skipped'});
    expect(deps.shopify.pushPreview).not.toHaveBeenCalled();
    expect(deps.github.upsertComment).not.toHaveBeenCalled();
  });

  it('does not delete a reopened pull request preview', async () => {
    const deps = clients(undefined, state);
    expect(await runPreview({...options, mode: 'cleanup'}, deps)).toMatchObject(
      {status: 'skipped'},
    );
    expect(deps.shopify.deleteTheme).not.toHaveBeenCalled();
  });

  it('verifies comment identity before deploy or cleanup', async () => {
    for (const mode of ['deploy', 'cleanup'] as const) {
      const deps = clients(
        {state: mode === 'cleanup' ? 'closed' : 'open', sha: repository.sha},
        {...state, store: 'other.myshopify.com'},
      );
      await expect(runPreview({...options, mode}, deps)).rejects.toThrow(
        'does not match',
      );
      expect(deps.shopify.pushPreview).not.toHaveBeenCalled();
      expect(deps.shopify.deleteTheme).not.toHaveBeenCalled();
    }
  });

  it('does not announce a failed upload as a preview', async () => {
    const deps = clients();
    deps.shopify.pushPreview.mockRejectedValue(new Error('upload failed'));
    await expect(runPreview(options, deps)).rejects.toThrow('upload failed');
    expect(deps.github.upsertComment).not.toHaveBeenCalled();
  });

  it('never claims Theme Check passed when it was disabled', async () => {
    const deps = clients();
    await runPreview({...options, strict: false}, deps);
    expect(deps.github.upsertComment.mock.calls[0]?.[0]).toContain(
      'Theme Check: not run',
    );
  });

  it('recovers cleanup by trusted context when no comment was recorded', async () => {
    const deps = clients({state: 'closed', sha: repository.sha});
    expect(await runPreview({...options, mode: 'cleanup'}, deps)).toEqual({
      status: 'removed',
    });
    expect(deps.shopify.deleteTheme).toHaveBeenCalledWith(
      undefined,
      options.context,
    );
    expect(deps.github.upsertComment).not.toHaveBeenCalled();
  });

  it('removes the recorded theme and any replacement whose comment failed', async () => {
    const deps = clients({state: 'closed', sha: repository.sha}, state);
    expect(await runPreview({...options, mode: 'cleanup'}, deps)).toEqual({
      status: 'removed',
    });
    expect(deps.shopify.deleteTheme.mock.calls).toEqual([
      ['123', options.context],
      [undefined, options.context],
    ]);
    expect(deps.github.upsertComment.mock.calls[0]?.[0]).toContain(
      'Preview removed',
    );
    expect(deps.shopify.deleteTheme.mock.invocationCallOrder[1]).toBeLessThan(
      deps.github.upsertComment.mock.invocationCallOrder[0]!,
    );
  });
});
