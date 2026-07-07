import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({ renderChart: vi.fn(async (_records: any, _out: any) => {}) }));
vi.mock('../../src/lib/chart', () => ({ renderChart: h.renderChart }));

import { reportCommand } from '../../src/commands/report';
import type { Records } from '../../src/lib/records';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sb-report-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const records: Records = {
  mode: 'serial',
  startedAt: '2020-01-01T00:00:00.000Z',
  finishedAt: '2020-01-01T00:00:02.000Z',
  downloadBeeUrl: 'x',
  sampleIntervalMs: 1000,
  settleMs: 0,
  chequebookEnabled: false,
  files: [
    { name: 'a', reference: 'r', size: 1000, startedAt: '2020-01-01T00:00:00.000Z', finishedAt: '2020-01-01T00:00:01.000Z', durationMs: 1000, bytesDownloaded: 1000, error: null },
  ],
  progressSamples: [{ tMs: 0, timestamp: 't', totalBytes: 0, perFile: {} }],
  chequebookSamples: [],
  balanceSamples: [],
};

describe('report command', () => {
  it('reads a records file and renders a chart to the output path', async () => {
    const input = path.join(dir, 'records.json');
    const output = path.join(dir, 'chart.png');
    await writeFile(input, JSON.stringify(records));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reportCommand.handler!({ input, output } as any);

    expect(h.renderChart).toHaveBeenCalledOnce();
    const [passedRecords, passedOut] = h.renderChart.mock.calls[0];
    expect(passedOut).toBe(output);
    expect((passedRecords as Records).files[0].bytesDownloaded).toBe(1000);
  });
});
