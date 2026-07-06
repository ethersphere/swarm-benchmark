/** Postage batch resolution. */

import type { Bee } from '@ethersphere/bee-js';

/**
 * Return the provided batch id, or auto-detect a usable batch on the node.
 * Throws with a clear message if neither is available.
 */
export async function resolveBatchId(bee: Bee, provided?: string): Promise<string> {
  if (provided) return provided;

  const batches = await bee.getPostageBatches();
  const usable = batches.find((b) => b.usable);
  if (!usable) {
    throw new Error(
      'No usable postage batch on the upload node. Pass --batch-id / set SWARM_BATCH_ID, ' +
        'or buy a batch first.',
    );
  }
  return usable.batchID.toHex();
}
