import {describe, expect, it, vi} from 'vitest';
import {
  runConfiguredBuild,
  type BuildCommandRunner,
} from '../src/build-runner.js';

describe('configured builds', () => {
  it('runs install before build without Shopify credentials', async () => {
    process.env.SHOPIFY_CLI_THEME_TOKEN = 'must-not-leak';
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'must-not-leak';
    process.env.GITHUB_TOKEN = 'must-not-leak';
    process.env.AWS_SECRET_ACCESS_KEY = 'must-not-leak';
    const runner = vi.fn<BuildCommandRunner>((_command, options) => {
      expect(options.env.SHOPIFY_CLI_THEME_TOKEN).toBeUndefined();
      expect(options.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBeUndefined();
      expect(options.env.GITHUB_TOKEN).toBeUndefined();
      expect(options.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(options.env.CI).toBe('true');
      return Promise.resolve({code: 0});
    });
    try {
      await runConfiguredBuild(
        {
          workingDirectory: '/workspace',
          setup: 'npm install --global pnpm',
          install: 'pnpm install',
          command: 'pnpm build',
        },
        runner,
      );
      expect(runner.mock.calls.map(([command]) => command)).toEqual([
        'npm install --global pnpm',
        'pnpm install',
        'pnpm build',
      ]);
    } finally {
      delete process.env.SHOPIFY_CLI_THEME_TOKEN;
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
      delete process.env.GITHUB_TOKEN;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });

  it('supports themes without install or build commands', async () => {
    const runner = vi.fn<BuildCommandRunner>();
    await runConfiguredBuild({workingDirectory: '/workspace'}, runner);
    expect(runner).not.toHaveBeenCalled();
  });

  it('stops after a failed command', async () => {
    const runner = vi.fn<BuildCommandRunner>(() => Promise.resolve({code: 2}));
    await expect(
      runConfiguredBuild(
        {
          workingDirectory: '/workspace',
          install: 'pnpm install',
          command: 'pnpm build',
        },
        runner,
      ),
    ).rejects.toThrow('install command failed (2)');
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
