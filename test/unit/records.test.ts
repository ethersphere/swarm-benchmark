import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeRecords, readRecords } from '../../src/lib/records';
import type { Records } from '../../src/lib/records';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sb-records-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function sampleRecords(): Records {
  return {
    mode: 'burst',
    startedAt: '2020-01-01T00:00:00.000Z',
    finishedAt: '2020-01-01T00:00:05.000Z',
    downloadBeeUrl: 'http://localhost:1635',
    sampleIntervalMs: 1000,
    settleMs: 0,
    chequebookEnabled: true,
    files: [
      { name: 'a', reference: 'r1', size: 1000, startedAt: '2020-01-01T00:00:00.000Z', finishedAt: '2020-01-01T00:00:01.000Z', durationMs: 1000, bytesDownloaded: 1000, error: null },
    ],
    progressSamples: [
      { tMs: 0, timestamp: 't0', totalBytes: 0, perFile: {} },
      { tMs: 1000, timestamp: 't1', totalBytes: 1000, perFile: { a: 1000 } },
    ],
    chequebookSamples: [
      { tMs: 0, timestamp: 't0', availableBalancePlur: '100', totalBalancePlur: '100', totalChequesValuePlur: '0', chequeCount: 0 },
      { tMs: 1000, timestamp: 't1', availableBalancePlur: '90', totalBalancePlur: '100', totalChequesValuePlur: '10', chequeCount: 1 },
    ],
    balanceSamples: [
      { tMs: 0, timestamp: 't0', netBalancePlur: '0', owedToPeersPlur: '0', owedByPeersPlur: '0', perPeer: { p: '0' }, peerCount: 1 },
      { tMs: 1000, timestamp: 't1', netBalancePlur: '-5', owedToPeersPlur: '5', owedByPeersPlur: '0', perPeer: { p: '-5' }, peerCount: 1 },
    ],
  };
}

describe('records serialization', () => {
  it('round-trips JSON exactly', async () => {
    const p = path.join(dir, 'r.json');
    const rec = sampleRecords();
    await writeRecords(p, rec);
    expect(await readRecords(p)).toEqual(rec);
  });

  it('exports CSV with a header + one row per progress sample', async () => {
    const p = path.join(dir, 'r.csv');
    await writeRecords(p, sampleRecords());
    const lines = (await readFile(p, 'utf8')).trim().split('\n');
    expect(lines[0]).toContain('tMs');
    expect(lines[0]).toContain('totalMB');
    expect(lines[0]).toContain('owedToPeersBzz');
    expect(lines).toHaveLength(1 + 2); // header + 2 progress samples
  });

  it('rejects reading a CSV back as full records', async () => {
    await expect(readRecords('somewhere.csv')).rejects.toThrow(/CSV/i);
  });
});
