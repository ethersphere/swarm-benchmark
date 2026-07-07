import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeFakeBee, type FakeBee } from '../helpers/fakeBee';

const h = vi.hoisted(() => ({ bee: undefined as unknown as FakeBee, chequebookEnabled: true }));
vi.mock('../../src/lib/bee', () => ({
  makeBee: () => h.bee,
  isChequebookEnabled: async () => h.chequebookEnabled,
}));

import { runDownload } from '../../src/lib/runner';
import type { Records } from '../../src/lib/records';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sb-runner-'));
  h.chequebookEnabled = true;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const files = [
  { name: 'a', reference: 'r1', size: 1000 },
  { name: 'b', reference: 'r2', size: 2000 },
];

async function run(over: Partial<Parameters<typeof runDownload>[0]> = {}): Promise<Records> {
  const out = path.join(dir, 'records.json');
  await runDownload({
    mode: 'serial',
    files,
    outPath: out,
    beeUrl: 'http://x',
    sampleIntervalMs: 10,
    settleMs: 0,
    notFoundRetries: 0,
    notFoundRetryDelayMs: 5,
    ...over,
  });
  return JSON.parse(await readFile(out, 'utf8')) as Records;
}

describe('runDownload', () => {
  it('serial: downloads each file and records bytes + mode', async () => {
    h.bee = makeFakeBee({ sizeByRef: { r1: 1000, r2: 2000 } });
    const rec = await run({ mode: 'serial' });
    expect(rec.mode).toBe('serial');
    expect(rec.files.map((f) => f.bytesDownloaded)).toEqual([1000, 2000]);
    expect(rec.files.every((f) => f.error === null)).toBe(true);
    expect(rec.progressSamples.length).toBeGreaterThanOrEqual(1);
  });

  it('burst: downloads all files in parallel', async () => {
    h.bee = makeFakeBee({ sizeByRef: { r1: 1000, r2: 2000 } });
    const rec = await run({ mode: 'burst' });
    expect(rec.mode).toBe('burst');
    expect(rec.files.reduce((s, f) => s + f.bytesDownloaded, 0)).toBe(3000);
  });

  it('retries a 404 straggler and recovers', async () => {
    h.bee = makeFakeBee({ notFoundUntilAttempt: 1, fileSize: 500 });
    const rec = await run({ files: [{ name: 'a', reference: 'r1', size: 500 }], notFoundRetries: 3 });
    expect(rec.files[0].error).toBeNull();
    expect(rec.files[0].bytesDownloaded).toBe(500);
    expect(h.bee.downloadAttempts.r1).toBe(2); // failed once, retried, succeeded
  });

  it('records an error when 404 retries are exhausted', async () => {
    h.bee = makeFakeBee({ notFoundRefs: new Set(['r1']), sizeByRef: { r2: 2000 } });
    const rec = await run({ mode: 'burst', notFoundRetries: 1 });
    expect(rec.files.find((f) => f.name === 'a')?.error).toMatch(/404/);
    expect(rec.files.find((f) => f.name === 'b')?.bytesDownloaded).toBe(2000); // others unaffected
  });

  it('captures chequebook + balance samples when enabled, none when disabled', async () => {
    h.bee = makeFakeBee({ balances: () => [{ peer: 'p', balance: 0n }] });
    const enabled = await run();
    expect(enabled.chequebookEnabled).toBe(true);
    expect(enabled.chequebookSamples.length).toBeGreaterThanOrEqual(1);
    expect(enabled.balanceSamples.length).toBeGreaterThanOrEqual(1);

    h.chequebookEnabled = false;
    h.bee = makeFakeBee({ chequebookEnabled: false });
    const disabled = await run();
    expect(disabled.chequebookEnabled).toBe(false);
    expect(disabled.chequebookSamples).toHaveLength(0);
    expect(disabled.balanceSamples).toHaveLength(0);
  });
});
