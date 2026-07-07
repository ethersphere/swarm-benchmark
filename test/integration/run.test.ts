import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeFakeBee, type FakeBee } from '../helpers/fakeBee';
import type { Records } from '../../src/lib/records';

const stubRecords: Records = {
  mode: 'burst', startedAt: '', finishedAt: '', downloadBeeUrl: 'x',
  sampleIntervalMs: 1, settleMs: 0, chequebookEnabled: false,
  files: [], progressSamples: [], chequebookSamples: [], balanceSamples: [],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const m = vi.hoisted(() => ({
  bee: undefined as unknown as FakeBee,
  generateDataset: vi.fn(async (..._a: any[]) => ({ outDir: 'd', specs: [], totalBytes: 0 })),
  uploadDataset: vi.fn(async (_opts: any) => [{ name: 'a', reference: 'r', size: 1 }]),
  runDownload: vi.fn(async (_opts: any) => {}),
  renderChart: vi.fn(async (_r: any, _o: any) => {}),
  readRecords: vi.fn(async (_p: any) => stubRecords),
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('../../src/lib/bee', () => ({ makeBee: () => m.bee, isChequebookEnabled: async () => false }));
vi.mock('../../src/lib/generate', () => ({ generateDataset: m.generateDataset }));
vi.mock('../../src/lib/upload', () => ({ uploadDataset: m.uploadDataset }));
vi.mock('../../src/lib/runner', () => ({ runDownload: m.runDownload }));
vi.mock('../../src/lib/chart', () => ({ renderChart: m.renderChart }));
vi.mock('../../src/lib/records', async (orig) => ({ ...(await orig()), readRecords: m.readRecords }));

import { runCommand } from '../../src/commands/run';

const base = {
  method: 'measure' as const,
  mode: 'burst' as const,
  uploadBeeUrl: 'http://up',
  downloadBeeUrl: 'http://dl',
  batchId: 'batch-1',
  outDir: 'runs',
  sampleInterval: 0.01,
  settle: 0,
  retries: 3,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (over: any) => runCommand.handler!({ ...base, ...over } as any);

beforeEach(() => {
  m.bee = makeFakeBee({});
});

describe('run command orchestration', () => {
  it('runs generate → upload → download → report in order', async () => {
    await run({ type: 'website', count: 2 });
    expect(m.generateDataset).toHaveBeenCalledOnce();
    expect(m.uploadDataset).toHaveBeenCalledOnce();
    expect(m.runDownload).toHaveBeenCalledOnce();
    expect(m.renderChart).toHaveBeenCalledOnce();

    const runArgs = m.runDownload.mock.calls[0][0];
    expect(runArgs.mode).toBe('burst');
    expect(runArgs.beeUrl).toBe('http://dl');
    expect(runArgs.notFoundRetries).toBe(3);
    expect(runArgs.files).toEqual([{ name: 'a', reference: 'r', size: 1 }]);
  });

  it('defaults count to 1 for large-file, 24 otherwise', async () => {
    await run({ type: 'large-file' });
    expect(m.generateDataset.mock.calls[0].slice(0, 2)).toEqual(['large-file', 1]);

    m.generateDataset.mockClear();
    await run({ type: 'music-album' });
    expect(m.generateDataset.mock.calls[0].slice(0, 2)).toEqual(['music-album', 24]);
  });

  it('uploads deferred for measure and synced for split', async () => {
    await run({ type: 'website', count: 1, method: 'measure' });
    expect(m.uploadDataset.mock.calls[0][0].deferred).toBe(true);

    m.uploadDataset.mockClear();
    await run({ type: 'website', count: 1, method: 'split' });
    expect(m.uploadDataset.mock.calls[0][0].deferred).toBe(false);
  });

  it('fails fast when a node is unreachable', async () => {
    m.bee = makeFakeBee({ unreachable: true });
    await expect(run({ type: 'website', count: 1 })).rejects.toThrow(/not reachable/i);
    expect(m.generateDataset).not.toHaveBeenCalled();
  });

  it('warns when upload and download nodes are identical (measure)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run({ type: 'website', count: 1, downloadBeeUrl: 'http://up' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/identical/i));
    warn.mockRestore();
  });
});
