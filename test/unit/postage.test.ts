import { describe, it, expect, vi } from 'vitest';
import { resolveBatchId } from '../../src/lib/postage';
import type { Bee } from '@ethersphere/bee-js';

function batch(over: Record<string, unknown>) {
  return {
    batchID: { toHex: () => over.id as string },
    usable: true,
    depth: 22,
    bucketDepth: 16,
    immutableFlag: false,
    utilization: 0,
    ...over,
  };
}

function beeWith(batches: unknown[]): Bee {
  return { getPostageBatches: async () => batches } as unknown as Bee;
}

describe('resolveBatchId', () => {
  it('returns a provided id without querying the node', async () => {
    const getPostageBatches = vi.fn();
    expect(await resolveBatchId({ getPostageBatches } as unknown as Bee, 'given')).toBe('given');
    expect(getPostageBatches).not.toHaveBeenCalled();
  });

  it('auto-detects a usable batch with capacity', async () => {
    expect(await resolveBatchId(beeWith([batch({ id: 'good' })]))).toBe('good');
  });

  it('skips a full immutable batch and picks one with headroom', async () => {
    // depth 21, bucketDepth 16 → max per bucket 2^5 = 32; utilization 32 = full
    const full = batch({ id: 'full', immutableFlag: true, depth: 21, bucketDepth: 16, utilization: 32 });
    const ok = batch({ id: 'ok', immutableFlag: true, depth: 22, bucketDepth: 16, utilization: 0 });
    expect(await resolveBatchId(beeWith([full, ok]))).toBe('ok');
  });

  it('treats mutable batches as always having capacity', async () => {
    const mutableFull = batch({ id: 'mut', immutableFlag: false, depth: 21, bucketDepth: 16, utilization: 999 });
    expect(await resolveBatchId(beeWith([mutableFull]))).toBe('mut');
  });

  it('throws when the only usable batch is a full immutable one', async () => {
    const full = batch({ id: 'full', immutableFlag: true, depth: 21, bucketDepth: 16, utilization: 32 });
    await expect(resolveBatchId(beeWith([full]))).rejects.toThrow(/no usable postage batch/i);
  });
});
