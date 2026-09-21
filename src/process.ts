import {spawn, type ChildProcess} from 'node:child_process';

export function stopProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: false,
    });
    killer.once('error', () => child.kill('SIGKILL'));
    return;
  }
  try {
    // Callers create a process group so a timed-out shell cannot leave build children running.
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}
