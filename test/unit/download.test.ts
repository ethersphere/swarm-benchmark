import { describe, it, expect } from 'vitest';
import { downloadWithProgress } from '../../src/lib/download';
import type { Bee } from '@ethersphere/bee-js';

describe('downloadWithProgress', () => {
  it('counts total bytes and reports per-chunk deltas', async () => {
    const bee = {
      downloadReadableFile: async () => ({
        // eslint-disable-next-line require-yield
        data: (async function* () {
          yield Buffer.alloc(100);
          yield Buffer.alloc(50);
        })(),
      }),
    } as unknown as Bee;

    const deltas: number[] = [];
    const total = await downloadWithProgress(bee, 'ref', (d) => deltas.push(d));
    expect(total).toBe(150);
    expect(deltas).toEqual([100, 50]);
  });

  it('propagates download errors (e.g. 404)', async () => {
    const bee = {
      downloadReadableFile: async () => {
        throw Object.assign(new Error('Request failed with status code 404'), { status: 404 });
      },
    } as unknown as Bee;
    await expect(downloadWithProgress(bee, 'ref', () => {})).rejects.toThrow('404');
  });
});
