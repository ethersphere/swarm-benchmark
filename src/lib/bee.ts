/** Bee client helpers. */

import { Bee } from '@ethersphere/bee-js';

export function makeBee(url: string): Bee {
  return new Bee(url);
}

/**
 * Detect whether the node has a chequebook (SWAP) enabled. Gateway / light
 * nodes without a chequebook throw on the endpoint; we degrade gracefully.
 */
export async function isChequebookEnabled(bee: Bee): Promise<boolean> {
  try {
    await bee.getChequebookAddress();
    return true;
  } catch {
    return false;
  }
}
