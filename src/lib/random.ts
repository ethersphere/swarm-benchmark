/** Streaming writer for fully-randomized files (constant memory, any size). */

import { randomFillSync } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

const BLOCK = 1024 * 1024; // 1 MiB write blocks

/**
 * Write `size` bytes of cryptographically-random data to `filePath`.
 *
 * Every block is freshly randomized so no two 4 KB Bee chunks are identical,
 * which defeats chunk deduplication and caching in the Bee node. A new buffer
 * is allocated per block because `stream.write` retains the buffer reference
 * until it is flushed, so the buffer must not be reused/overwritten.
 */
export async function writeRandomFile(
  filePath: string,
  size: number,
  onProgress?: (written: number) => void,
): Promise<void> {
  const stream = createWriteStream(filePath);
  let remaining = size;
  let written = 0;
  try {
    while (remaining > 0) {
      const n = Math.min(BLOCK, remaining);
      const chunk = Buffer.allocUnsafe(n);
      randomFillSync(chunk);
      if (!stream.write(chunk)) {
        await once(stream, 'drain');
      }
      remaining -= n;
      written += n;
      onProgress?.(written);
    }
  } finally {
    stream.end();
    await once(stream, 'finish');
  }
}
