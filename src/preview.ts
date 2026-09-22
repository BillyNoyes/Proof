import {validateThemeArtifact} from './artifact.js';
import {renderPreviewComment, renderRemovedComment} from './comment.js';
import type {GitHubClient} from './github.js';
import type {ShopifyClient} from './shopify.js';
import type {PreviewState, RepositoryContext, ThemePreview} from './types.js';

interface PreviewOptions {
  repository: RepositoryContext;
  mode: 'deploy' | 'cleanup';
  store: string;
  context: string;
  themePath: string;
  strict: boolean;
}

interface Clients {
  github: Pick<
    GitHubClient,
    'currentPullRequest' | 'findProofComment' | 'upsertComment'
  >;
  shopify: Pick<ShopifyClient, 'pushPreview' | 'deleteTheme'>;
}

type Result =
  | {status: 'skipped'; reason: string}
  | {status: 'removed'}
  | {status: 'deployed'; theme: ThemePreview};

export async function runPreview(
  options: PreviewOptions,
  {github, shopify}: Clients,
): Promise<Result> {
  const current = await github.currentPullRequest();
  if (
    options.mode === 'deploy' &&
    (current.state !== 'open' || current.sha !== options.repository.sha)
  ) {
    return {
      status: 'skipped',
      reason: 'Pull request is closed or this commit is no longer current.',
    };
  }
  if (options.mode === 'cleanup' && current.state !== 'closed') {
    return {
      status: 'skipped',
      reason: 'Pull request has reopened; keeping its preview.',
    };
  }
  const existing = await github.findProofComment();
  if (existing) assertMatchingState(existing.state, options);
  if (options.mode === 'cleanup') {
    // An upload can succeed before its comment state is posted or can replace a stale recorded ID.
    await shopify.deleteTheme(existing?.state.themeId, options.context);
    if (existing) {
      await shopify.deleteTheme(undefined, options.context);
      await github.upsertComment(renderRemovedComment(existing.state));
    }
    return {status: 'removed'};
  }

  const artifact = await validateThemeArtifact(options.themePath);
  const theme = await shopify.pushPreview({
    path: artifact.root,
    context: options.context,
    strict: options.strict,
  });
  const state: PreviewState = {
    schemaVersion: 1,
    repository: options.repository.fullName,
    pullRequest: options.repository.pullRequest,
    context: options.context,
    store: options.store,
    themeId: theme.id,
    previewUrl: theme.previewUrl,
    editorUrl: theme.editorUrl,
    sha: options.repository.sha,
  };
  await github.upsertComment(renderPreviewComment(state, options.strict));
  return {status: 'deployed', theme};
}

function assertMatchingState(
  state: PreviewState,
  options: PreviewOptions,
): void {
  if (
    state.repository !== options.repository.fullName ||
    state.pullRequest !== options.repository.pullRequest ||
    state.store !== options.store ||
    state.context !== options.context
  ) {
    throw new Error('recorded preview state does not match this pull request');
  }
}
