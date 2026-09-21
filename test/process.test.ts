import {describe, expect, it} from 'vitest';
import {runCommand} from '../src/shopify.js';
import {runShellCommand} from '../src/build-runner.js';

const options = {cwd: process.cwd(), env: process.env, timeoutMs: 2_000};

describe('real subprocess handling', () => {
  it('captures stdout, stderr, and nonzero exits without shell interpolation', async () => {
    expect(
      await runCommand(
        process.execPath,
        [
          '-e',
          'process.stdout.write("ok"); process.stderr.write("error"); process.exitCode = 2',
        ],
        options,
      ),
    ).toEqual({code: 2, stdout: 'ok', stderr: 'error'});
  });
  it('rejects missing executables', async () => {
    await expect(
      runCommand('proof-command-does-not-exist', [], options),
    ).rejects.toThrow();
  });
  it('bounds CLI output', async () => {
    await expect(
      runCommand(
        process.execPath,
        ['-e', 'process.stdout.write("x".repeat(2_000_000))'],
        options,
      ),
    ).rejects.toThrow('output exceeded');
  });
  it('terminates timed-out CLI processes', async () => {
    await expect(
      runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        ...options,
        timeoutMs: 100,
      }),
    ).rejects.toThrow('timed out');
  });
  it('terminates timed-out build shells and their children', async () => {
    await expect(
      runShellCommand(
        `"${process.execPath}" -e "setInterval(() => {}, 1000)"`,
        {...options, timeoutMs: 100},
      ),
    ).rejects.toThrow('timed out');
  });
});
