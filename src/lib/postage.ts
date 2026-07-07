/** Postage batch resolution. */

import type { Bee, PostageBatch } from '@ethersphere/bee-js';

/**
 * Whether a batch can still stamp new chunks. Immutable batches hard-reject
 * (HTTP 402) once the fullest bucket is at capacity — `2^(depth - bucketDepth)`
 * chunks — so we require headroom. Mutable batches reuse space, so they always
 * count as having capacity.
 */
function hasCapacity(b: PostageBatch): boolean {
  if (!b.immutableFlag) return true;
  const maxPerBucket = 2 ** (b.depth - b.bucketDepth);
  return b.utilization < maxPerBucket;
}

/**
 * Return the provided batch id, or auto-detect a usable batch *with capacity* on
 * the node. A full immutable batch stays `usable`, so capacity is checked too.
 */
export async function resolveBatchId(bee: Bee, provided?: string): Promise<string> {
  if (provided) return provided;

  const batches = await bee.getPostageBatches();
  const candidate = batches.find((b) => b.usable && hasCapacity(b));
  if (!candidate) {
    const full = batches.filter((b) => b.usable).length;
    throw new Error(
      'No usable postage batch with free capacity on the upload node' +
        (full ? ` (${full} usable but full).` : '.') +
        ' Pass --batch-id / set SWARM_BATCH_ID, or buy a new (ideally mutable) batch.',
    );
  }
  return candidate.batchID.toHex();
}
