import { describe, it, expect } from 'vitest';
import { Sampler } from '../../src/lib/sampler';
import { makeFakeBee } from '../helpers/fakeBee';
import type { Bee } from '@ethersphere/bee-js';
import type { BalanceSample, ChequebookSample, ProgressSample } from '../../src/lib/records';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Sampler', () => {
  it('takes an immediate baseline sample and then samples on the interval', async () => {
    const progressSamples: ProgressSample[] = [];
    const chequebookSamples: ChequebookSample[] = [];
    const balanceSamples: BalanceSample[] = [];
    const bee = makeFakeBee({
      availableBalancePlur: () => 0n,
      totalBalancePlur: () => 0n,
      cheques: () => [],
      balances: () => [{ peer: 'p', balance: 0n }],
    }) as unknown as Bee;

    const sampler = new Sampler({
      bee,
      chequebookEnabled: true,
      intervalMs: 20,
      t0: Date.now(),
      getProgress: () => ({ totalBytes: 5, perFile: { a: 5 } }),
      progressSamples,
      chequebookSamples,
      balanceSamples,
    });

    sampler.start();
    await sleep(70);
    await sampler.stop();

    expect(progressSamples.length).toBeGreaterThanOrEqual(2);
    expect(progressSamples[0].perFile).toEqual({ a: 5 });
    expect(chequebookSamples.length).toBeGreaterThanOrEqual(1);
    expect(balanceSamples.length).toBeGreaterThanOrEqual(1);
    expect(balanceSamples[0].perPeer).toEqual({ p: '0' });
  });

  it('skips chequebook/balance sampling when the chequebook is disabled', async () => {
    const progressSamples: ProgressSample[] = [];
    const chequebookSamples: ChequebookSample[] = [];
    const balanceSamples: BalanceSample[] = [];
    const bee = makeFakeBee({}) as unknown as Bee;

    const sampler = new Sampler({
      bee,
      chequebookEnabled: false,
      intervalMs: 20,
      t0: Date.now(),
      getProgress: () => ({ totalBytes: 0, perFile: {} }),
      progressSamples,
      chequebookSamples,
      balanceSamples,
    });

    sampler.start();
    await sleep(50);
    await sampler.stop();

    expect(progressSamples.length).toBeGreaterThanOrEqual(1);
    expect(chequebookSamples).toHaveLength(0);
    expect(balanceSamples).toHaveLength(0);
  });
});
