import {spawn} from 'node:child_process';

export interface BuildCommandResult {
  code: number;
}

export type BuildCommandRunner = (
  command: string,
  options: {cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number},
) => Promise<BuildCommandResult>;

export async function runConfiguredBuild(
  config: {
    workingDirectory: string;
    setup?: string;
    install?: string;
    command?: string;
  },
  runner: BuildCommandRunner = runShellCommand,
): Promise<void> {
  const env = buildEnvironment();
  if (config.setup) {
    await runStep('setup', config.setup, config.workingDirectory, env, runner);
  }
  if (config.install) {
    await runStep(
      'install',
      config.install,
      config.workingDirectory,
      env,
      runner,
    );
  }
  if (config.command) {
    await runStep(
      'build',
      config.command,
      config.workingDirectory,
      env,
      runner,
    );
  }
}

export const runShellCommand: BuildCommandRunner = (command, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      env: options.env,
      shell: true,
      stdio: 'inherit',
    });
    child.once('error', reject);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('build command timed out'));
    }, options.timeoutMs);
    timeout.unref();
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolve({code: code ?? 1});
    });
  });

function buildEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {...process.env, CI: 'true'};
  for (const name of Object.keys(env)) {
    if (
      /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)(?:_|$)/i.test(
        name,
      )
    ) {
      delete env[name];
    }
  }
  return env;
}

async function runStep(
  name: string,
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: BuildCommandRunner,
): Promise<void> {
  const result = await runner(command, {cwd, env, timeoutMs: 15 * 60_000});
  if (result.code !== 0)
    throw new Error(`${name} command failed (${result.code})`);
}
