import * as core from '@actions/core';
import {resolve} from 'node:path';
import {
  normalizeStore,
  parseBoolean,
  readRepositoryContext,
  resolvePreviewContext,
} from './config.js';
import {GitHubClient} from './github.js';
import {runPreview} from './preview.js';
import {ShopifyClient} from './shopify.js';

async function run(): Promise<void> {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    throw new Error(
      'Theme Proof requires a pull_request event; pull_request_target is not supported',
    );
  }
  const mode = core.getInput('mode') || 'deploy';
  if (mode !== 'deploy' && mode !== 'cleanup')
    throw new Error('mode must be deploy or cleanup');
  if (
    (core.getInput('target-mode') || 'development-context') !==
    'development-context'
  ) {
    throw new Error('target-mode currently supports only development-context');
  }
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
  core.info(`Using Shopify CLI ${await shopify.verifyVersion()}`);
  const result = await runPreview(
    {
      repository,
      mode,
      store,
      context,
      themePath: resolve(core.getInput('theme-path') || '.'),
      strict: parseBoolean(core.getInput('strict') || 'true', 'strict'),
    },
    {github, shopify},
  );
  if (result.status === 'skipped') {
    core.notice(result.reason);
    return;
  }
  if (result.status === 'removed') {
    core.notice('Removed Theme Proof preview.');
    return;
  }
  const {theme} = result;
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

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
