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
  on: {workflow_call: {secrets: Record<string, {required: boolean}>}};
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

  it('declares and documents only the named Theme Access secret', async () => {
    expect(Object.keys(workflow.on.workflow_call.secrets)).toEqual([
      'SHOPIFY_CLI_THEME_TOKEN',
    ]);
    expect(
      workflow.on.workflow_call.secrets.SHOPIFY_CLI_THEME_TOKEN?.required,
    ).toBe(false);
    for (const path of [
      '../examples/theme-proof.yml',
      '../site/docs/index.html',
    ]) {
      const example = await readFile(new URL(path, import.meta.url), 'utf8');
      expect(example).toContain(
        'SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}',
      );
    }
  });

  it('documents the exact release caller instead of main', async () => {
    const {version} = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {version: string};
    for (const path of [
      '../examples/theme-proof.yml',
      '../site/docs/index.html',
    ]) {
      const example = await readFile(new URL(path, import.meta.url), 'utf8');
      expect(example).toContain(
        `uses: BillyNoyes/Proof/.github/workflows/preview.yml@v${version}`,
      );
      expect(example).not.toContain('preview.yml@main');
    }
    const readme = await readFile(
      new URL('../README.md', import.meta.url),
      'utf8',
    );
    expect(readme).toContain(
      'https://github.com/marketplace/actions/theme-proof',
    );
    expect(readme).toContain('releases/download/v1.0.0/theme-proof.yml');
  });

  it('ships a complete ready-made caller workflow', async () => {
    const caller = parse(
      await readFile(
        new URL('../examples/theme-proof.yml', import.meta.url),
        'utf8',
      ),
    ) as {
      on: {pull_request: {types: string[]}};
      permissions: Record<string, string>;
      jobs: {
        preview: {
          if: string;
          uses: string;
          with: {environment: string};
          secrets: Record<string, string>;
        };
      };
    };
    expect(caller.on.pull_request.types).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'closed',
    ]);
    expect(caller.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'write',
    });
    expect(caller.jobs.preview).toMatchObject({
      if: 'github.event.pull_request.head.repo.full_name == github.repository',
      with: {environment: 'theme-preview'},
      secrets: {
        SHOPIFY_CLI_THEME_TOKEN: '${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}',
      },
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
    const proofPins: string[] = [];
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (!step.uses) continue;
        expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
        if (step.uses.startsWith('BillyNoyes/Proof')) {
          proofPins.push(step.uses.split('@')[1]!);
        }
      }
    }
    expect(new Set(proofPins)).toEqual(
      new Set(['78a5f11269ec3a55c06e860453a1bc0c490d6d4b']),
    );
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
