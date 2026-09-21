import * as core from '@actions/core';
import {join} from 'node:path';
import {prepareThemeArtifact} from './artifact.js';
import {runConfiguredBuild} from './build-runner.js';
import {loadProjectConfig} from './project-config.js';

async function run(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) throw new Error('GITHUB_WORKSPACE is required');
  const config = await loadProjectConfig(
    workspace,
    core.getInput('config') || 'theme-proof.config.json',
  );
  if (config.configPath) {
    core.info(`Using ${config.configPath}`);
  } else {
    core.info(
      'No Theme Proof config found; using a no-build theme at the repository root.',
    );
  }
  await runConfiguredBuild(config);
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp) throw new Error('RUNNER_TEMP is required');
  const artifact = await prepareThemeArtifact(
    config.themeDirectory,
    join(runnerTemp, 'theme-proof-artifact'),
  );
  core.setOutput('theme-path', artifact.root);
  core.setOutput('files', artifact.files);
  core.setOutput('bytes', artifact.bytes);
  core.info(
    `Prepared ${artifact.files} theme files (${artifact.bytes} bytes).`,
  );
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
