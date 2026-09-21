import {describe, expect, it, vi} from 'vitest';
import {renderPreviewComment} from '../src/comment.js';
import {GitHubClient} from '../src/github.js';
import type {PreviewState, RepositoryContext} from '../src/types.js';

const repository: RepositoryContext = {
  owner: 'BillyNoyes',
  repository: 'Proof',
  fullName: 'BillyNoyes/Proof',
  repositoryId: 123,
  pullRequest: 42,
  sha: 'abc123',
};
const state: PreviewState = {
  schemaVersion: 1,
  repository: repository.fullName,
  pullRequest: repository.pullRequest,
  context: 'proof-123-42',
  store: 'example.myshopify.com',
  themeId: '123456789',
  previewUrl: 'https://example.myshopify.com/?preview_theme_id=123456789',
  editorUrl: 'https://example.myshopify.com/admin/themes/123456789/editor',
  sha: repository.sha,
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('GitHub pull request comments', () => {
  it('updates only a comment owned by the configured bot', async () => {
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      if (url.includes('/issues/42/comments?')) {
        return Promise.resolve(
          response([
            {
              id: 1,
              body: renderPreviewComment(state),
              user: {login: 'untrusted-bot[bot]'},
            },
            {
              id: 2,
              body: renderPreviewComment(state),
              user: {login: 'github-actions[bot]'},
            },
          ]),
        );
      }
      if (url.endsWith('/issues/comments/2') && init?.method === 'PATCH') {
        return Promise.resolve(response({id: 2}));
      }
      return Promise.resolve(response({message: 'unexpected'}, 500));
    });
    const client = new GitHubClient(
      'token',
      repository,
      'github-actions[bot]',
      fetcher,
    );
    await client.upsertComment('updated');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/BillyNoyes/Proof/issues/comments/2',
      expect.objectContaining({method: 'PATCH'}),
    );
  });

  it('creates a comment when no owned state exists', async () => {
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      if (url.includes('/issues/42/comments?')) {
        return Promise.resolve(response([]));
      }
      if (url.endsWith('/issues/42/comments') && init?.method === 'POST') {
        return Promise.resolve(response({id: 3}, 201));
      }
      return Promise.resolve(response({message: 'unexpected'}, 500));
    });
    const client = new GitHubClient(
      'token',
      repository,
      'github-actions[bot]',
      fetcher,
    );
    await client.upsertComment(renderPreviewComment(state));
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/BillyNoyes/Proof/issues/42/comments',
      expect.objectContaining({method: 'POST'}),
    );
  });
});
