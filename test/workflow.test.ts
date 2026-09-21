import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {parse} from 'yaml';

interface Job {
  if: string;
  permissions: Record<string, string>;
  environment?: string;
  concurrency: {group: string; 'cancel-in-progress': boolean};
  steps: {uses?: string; with?: Record<string, string>}[];
}
const text = await readFile(
  new URL('../.github/workflows/preview.yml', import.meta.url),
  'utf8',
);
const workflow = parse(text) as {
  permissions: Record<string, string>;
  jobs: {build: Job; deploy: Job; cleanup: Job};
};

describe('reusable workflow security policy', () => {
  it('gives the untrusted build only read access and no environment', () => {
    expect(workflow.permissions).toEqual({contents: 'read'});
    expect(workflow.jobs.build.permissions).toEqual({contents: 'read'});
    expect(workflow.jobs.build.environment).toBeUndefined();
    expect(JSON.stringify(workflow.jobs.build)).not.toContain('secrets.');
    expect(workflow.jobs.build.steps[0]?.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ github.event.pull_request.head.sha }}',
    });
  });

  it('enforces same-repository pull_request events for every job', () => {
    for (const job of Object.values(workflow.jobs)) {
      expect(job.if).toContain("github.event_name == 'pull_request'");
      expect(job.if).toContain(
        'github.event.pull_request.head.repo.id == github.event.repository.id',
      );
    }
  });

  it('serializes deployment and cleanup without canceling a running mutation', () => {
    expect(workflow.jobs.deploy.concurrency).toEqual(
      workflow.jobs.cleanup.concurrency,
    );
    expect(workflow.jobs.deploy.concurrency['cancel-in-progress']).toBe(false);
    expect(workflow.jobs.build.concurrency['cancel-in-progress']).toBe(true);
    expect(workflow.jobs.build.concurrency.group).not.toBe(
      workflow.jobs.deploy.concurrency.group,
    );
  });

  it('pins every nested Action to a full commit SHA', () => {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
      }
    }
  });

  it('never checks out PR scripts into credentialed jobs', () => {
    for (const job of [workflow.jobs.deploy, workflow.jobs.cleanup]) {
      expect(job.environment).toBe('${{ inputs.environment }}');
      expect(
        job.steps.some((step) => step.uses?.startsWith('actions/checkout')),
      ).toBe(false);
      expect(job.permissions['pull-requests']).toBe('write');
    }
  });
});
