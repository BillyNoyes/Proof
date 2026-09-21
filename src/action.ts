import * as core from '@actions/core';
import {resolve} from 'node:path';
import {validateThemeArtifact} from './artifact.js';
import {
  normalizeStore,
  parseBoolean,
  readRepositoryContext,
  resolvePreviewContext,
} from './config.js';
import {renderPreviewComment, renderRemovedComment} from './comment.js';
import {GitHubClient} from './github.js';
import {ShopifyClient} from './shopify.js';
import type {PreviewState} from './types.js';

async function run(): Promise<void> {
  const password = core.getInput('password', {required: true});
  const githubToken = core.getInput('github-token', {required: true});
  core.setSecret(password);
  core.setSecret(githubToken);

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required');
  const repository = await readRepositoryContext(
    eventPath,
    core.getInput('pull-request-number'),
  );
  const store = normalizeStore(core.getInput('store', {required: true}));
  const context = resolvePreviewContext(
    core.getInput('context'),
    repository.repositoryId,
    repository.pullRequest,
  );
  const github = new GitHubClient(
    githubToken,
    repository,
    core.getInput('comment-author') || 'github-actions[bot]',
  );
  const shopify = new ShopifyClient({
    command: core.getInput('shopify-command') || 'shopify',
    store,
    password,
  });
  const cliVersion = await shopify.verifyVersion();
  core.info(`Using Shopify CLI ${cliVersion}`);

  const mode = core.getInput('mode') || 'deploy';
  if (mode === 'cleanup') {
    const existing = await github.findProofComment();
    if (!existing) {
      core.notice('No Theme Proof preview was recorded for this pull request.');
      return;
    }
    assertMatchingState(
      existing.state,
      repository.fullName,
      repository.pullRequest,
      store,
      context,
    );
    await shopify.deleteTheme(existing.state.themeId);
    await github.upsertComment(renderRemovedComment(existing.state));
    core.notice(`Removed Theme Proof preview ${existing.state.themeId}.`);
    return;
  }
  if (mode !== 'deploy') throw new Error('mode must be deploy or cleanup');

  const artifact = await validateThemeArtifact(
    resolve(core.getInput('theme-path') || '.'),
  );
  core.info(
    `Validated ${artifact.files} theme files (${artifact.bytes} bytes).`,
  );
  const strict = parseBoolean(core.getInput('strict') || 'true', 'strict');
  const theme = await shopify.pushPreview({
    path: artifact.root,
    context,
    strict,
  });
  const state: PreviewState = {
    schemaVersion: 1,
    repository: repository.fullName,
    pullRequest: repository.pullRequest,
    context,
    store,
    themeId: theme.id,
    previewUrl: theme.previewUrl,
    editorUrl: theme.editorUrl,
    sha: repository.sha,
  };
  await github.upsertComment(renderPreviewComment(state));
  core.setOutput('theme-id', theme.id);
  core.setOutput('preview-url', theme.previewUrl);
  core.setOutput('editor-url', theme.editorUrl);
  core.setOutput('context', context);
  await core.summary
    .addHeading('Theme Proof')
    .addLink('Storefront preview', theme.previewUrl)
    .addRaw(' · ')
    .addLink('Theme Editor', theme.editorUrl)
    .write();
}

function assertMatchingState(
  state: PreviewState,
  repository: string,
  pullRequest: number,
  store: string,
  context: string,
): void {
  if (
    state.repository !== repository ||
    state.pullRequest !== pullRequest ||
    state.store !== store ||
    state.context !== context
  ) {
    throw new Error('recorded preview state does not match this pull request');
  }
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
