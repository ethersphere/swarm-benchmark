import { describe, it, expect } from 'vitest';
import { accountingOutflow, computeSummary } from '../../src/lib/summary';
import { MB } from '../../src/lib/units';
import type { BalanceSample, ChequebookSample, FileRecord, Records } from '../../src/lib/records';

function balSample(tMs: number, perPeer: Record<string, string>): BalanceSample {
  return {
    tMs,
    timestamp: new Date(tMs).toISOString(),
    netBalancePlur: '0',
    owedToPeersPlur: '0',
    owedByPeersPlur: '0',
    perPeer,
    peerCount: Object.keys(perPeer).length,
  };
}

function cheqSample(tMs: number, availPlur: bigint, chequesPlur: bigint, count = 1): ChequebookSample {
  return {
    tMs,
    timestamp: new Date(tMs).toISOString(),
    availableBalancePlur: availPlur.toString(),
    totalBalancePlur: '100000000000000000',
    totalChequesValuePlur: chequesPlur.toString(),
    chequeCount: count,
  };
}

function file(size: number, bytes: number, error: string | null = null): FileRecord {
  return {
    name: 'f',
    reference: 'r',
    size,
    startedAt: '2020-01-01T00:00:00.000Z',
    finishedAt: '2020-01-01T00:00:10.000Z',
    durationMs: 10_000,
    bytesDownloaded: bytes,
    error,
  };
}

function makeRecords(over: Partial<Records>): Records {
  return {
    mode: 'serial',
    startedAt: '',
    finishedAt: '',
    downloadBeeUrl: 'x',
    sampleIntervalMs: 1000,
    settleMs: 0,
    chequebookEnabled: true,
    files: [],
    progressSamples: [],
    chequebookSamples: [],
    balanceSamples: [],
    ...over,
  };
}

describe('accountingOutflow', () => {
  it('is 0 with no samples', () => {
    expect(accountingOutflow([])).toBe(0n);
  });

  it('sums per-peer balance decreases (payments), ignoring increases (credit)', () => {
    // A rises +4000 (storage credit — ignored); B pays 300, C pays 320 → 620
    const first = balSample(0, { A: '1000', B: '0', C: '0' });
    const last = balSample(1000, { A: '5000', B: '-300', C: '-320' });
    expect(accountingOutflow([first, last])).toBe(620n);
  });

  it('counts peers that appear only in the later sample', () => {
    const first = balSample(0, { A: '0' });
    const last = balSample(1000, { A: '-100', B: '-50' });
    expect(accountingOutflow([first, last])).toBe(150n);
  });

  it('measures up to a given intermediate sample', () => {
    const s0 = balSample(0, { A: '0' });
    const s1 = balSample(1000, { A: '-100' });
    const s2 = balSample(2000, { A: '-250' });
    expect(accountingOutflow([s0, s1, s2], s1)).toBe(100n);
    expect(accountingOutflow([s0, s1, s2], s2)).toBe(250n);
  });
});

describe('computeSummary', () => {
  it('derives bytes, throughput, and failed count', () => {
    const s = computeSummary(
      makeRecords({ files: [file(100 * MB, 100 * MB), file(50 * MB, 0, 'boom')] }),
    );
    expect(s.totalBytes).toBe(100 * MB);
    expect(s.fileCount).toBe(2);
    expect(s.failedCount).toBe(1);
    expect(s.downloadSeconds).toBe(10);
    expect(s.aggregateMBps).toBeCloseTo(10, 6); // 100 MB / 10 s
  });

  it('uses cheque delta above the payment threshold', () => {
    const s = computeSummary(
      makeRecords({
        files: [file(100 * MB, 100 * MB)],
        chequebookSamples: [
          cheqSample(0, 100n * 10n ** 16n, 0n),
          cheqSample(1000, 100n * 10n ** 16n - 10n ** 16n, 10n ** 16n), // 1 BZZ of cheques
        ],
      }),
    );
    expect(s.chequeSpentPlur).toBe(10n ** 16n);
    expect(s.accountingSpentPlur).toBe(0n);
    expect(s.spentSource).toBe('cheques');
    expect(s.mbPerBzz).toBeCloseTo(100, 6);
  });

  it('falls back to accounting outflow below the threshold', () => {
    const s = computeSummary(
      makeRecords({
        files: [file(100 * MB, 100 * MB)],
        chequebookSamples: [cheqSample(0, 0n, 0n, 0), cheqSample(1000, 0n, 0n, 0)],
        balanceSamples: [balSample(0, { P: '0' }), balSample(1000, { P: '-5000000000000000' })], // 0.5 BZZ debt
      }),
    );
    expect(s.chequeSpentPlur).toBe(0n);
    expect(s.accountingSpentPlur).toBe(5n * 10n ** 15n);
    expect(s.spentSource).toBe('accounting');
    expect(s.mbPerBzz).toBeCloseTo(200, 6); // 100 MB / 0.5 BZZ
  });

  it('sums cheque + accounting when both fired (complementary signals)', () => {
    const s = computeSummary(
      makeRecords({
        files: [file(100 * MB, 100 * MB)],
        chequebookSamples: [cheqSample(0, 0n, 0n), cheqSample(1000, 0n, 10n ** 16n)],
        balanceSamples: [balSample(0, { P: '0' }), balSample(1000, { P: '-10000000000000000' })],
      }),
    );
    expect(s.spentPlur).toBe(2n * 10n ** 16n); // 1 + 1 BZZ
    expect(s.spentSource).toBe('cheques+accounting');
  });

  it('reports no spend when nothing was paid', () => {
    const s = computeSummary(
      makeRecords({
        files: [file(100 * MB, 100 * MB)],
        chequebookSamples: [cheqSample(0, 5n, 0n, 0), cheqSample(1000, 5n, 0n, 0)],
        balanceSamples: [balSample(0, { P: '10' }), balSample(1000, { P: '10' })],
      }),
    );
    expect(s.spentPlur).toBe(0n);
    expect(s.spentSource).toBe('none');
    expect(s.mbPerBzz).toBeNull();
  });
});
