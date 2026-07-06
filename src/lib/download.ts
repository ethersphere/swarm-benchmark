/** Download a single Swarm reference while reporting byte-level progress. */

import type { Bee } from '@ethersphere/bee-js';

/**
 * Stream a reference from the node, invoking `onBytes` with the size of each
 * received chunk so callers can track progress in real time. Returns the total
 * number of bytes downloaded.
 */
export async function downloadWithProgress(
  bee: Bee,
  reference: string,
  onBytes: (delta: number) => void,
): Promise<number> {
  // Files are uploaded via `uploadFile` (a bzz manifest), so resolve them via
  // the file endpoint. bee-js types the body as a web ReadableStream, but at
  // runtime it returns a Node Readable (IncomingMessage); both are
  // async-iterable, so iterate directly.
  const result = await bee.downloadReadableFile(reference);
  const stream = result.data as unknown as AsyncIterable<Uint8Array | Buffer>;
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.byteLength;
    onBytes(chunk.byteLength);
  }
  return total;
}
