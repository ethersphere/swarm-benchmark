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
  uploadDataset: vi.fn(async (_opts: any) => [{ name: 'a', reference: 'r', size: 1 }]),
  runDownload: vi.fn(async (_opts: any) => {}),
  renderChart: vi.fn(async (_r: any, _o: any) => {}),
  readRecords: vi.fn(async (_p: any) => stubRecords),
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('../../src/lib/bee', () => ({ makeBee: () => m.bee, isChequebookEnabled: async () => false }));
vi.mock('../../src/lib/upload', () => ({ uploadDataset: m.uploadDataset }));
vi.mock('../../src/lib/runner', () => ({ runDownload: m.runDownload }));
vi.mock('../../src/lib/chart', () => ({ renderChart: m.renderChart }));
vi.mock('../../src/lib/records', async (orig) => ({ ...(await orig()), readRecords: m.readRecords }));

import { measureCommand } from '../../src/commands/measure';

const base = {
  dataset: 'ds',
  uploadBeeUrl: 'http://up',
  downloadBeeUrl: 'http://dl',
  batchId: 'batch-1',
  mode: 'burst' as const,
  out: 'records.json',
  sampleInterval: 0.01,
  settle: 0,
  retries: 3,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const measure = (over: any) => measureCommand.handler!({ ...base, ...over } as any);

beforeEach(() => {
  m.bee = makeFakeBee({});
});

describe('measure command', () => {
  it('deferred-uploads then downloads from the download node', async () => {
    await measure({});
    expect(m.uploadDataset.mock.calls[0][0].deferred).toBe(true);
    const runArgs = m.runDownload.mock.calls[0][0];
    expect(runArgs.beeUrl).toBe('http://dl');
    expect(runArgs.mode).toBe('burst');
    expect(runArgs.notFoundRetries).toBe(3);
  });

  it('renders a report only when --report is given', async () => {
    await measure({});
    expect(m.renderChart).not.toHaveBeenCalled();

    m.runDownload.mockClear();
    await measure({ report: 'out.png' });
    expect(m.renderChart).toHaveBeenCalledOnce();
  });

  it('requires a postage batch id', async () => {
    await expect(measure({ batchId: undefined })).rejects.toThrow(/batch id/i);
  });

  it('warns when upload and download nodes are identical', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await measure({ downloadBeeUrl: 'http://up' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/same|identical/i));
    warn.mockRestore();
  });
});
