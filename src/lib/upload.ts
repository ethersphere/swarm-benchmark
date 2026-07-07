/** Stream a generated dataset to a Bee node, producing reference records. */

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import type { Bee } from '@ethersphere/bee-js';
import { DATASET_FILE, type DatasetManifest } from './dataset';
import type { ManifestFile } from './manifest';

export interface UploadDatasetOptions {
  bee: Bee;
  datasetDir: string;
  batchId: string;
  /**
   * Deferred = return before the data is pushed to the network. `measure` uses
   * deferred so the data stays on the upload node and the download node must
   * retrieve (and pay) it. A plain `upload` uses non-deferred so the data is
   * network-wide retrievable before a later download.
   */
  deferred: boolean;
  onFileStart?: (file: { name: string; size: number }, index: number, total: number) => void;
  /** Bytes sent to the node so far for the current file. */
  onProgress?: (name: string, sent: number, total: number) => void;
  /** Called after each file finishes uploading. */
  onFile?: (file: ManifestFile) => void;
}

export async function uploadDataset(opts: UploadDatasetOptions): Promise<ManifestFile[]> {
  const datasetJson = path.join(opts.datasetDir, DATASET_FILE);
  const dataset = JSON.parse(await readFile(datasetJson, 'utf8')) as DatasetManifest;

  const files: ManifestFile[] = [];
  for (let i = 0; i < dataset.files.length; i++) {
    const f = dataset.files[i];
    opts.onFileStart?.(f, i, dataset.files.length);

    // Count bytes as bee-js pulls them from the stream, for upload progress.
    const raw = createReadStream(path.join(opts.datasetDir, f.name));
    let sent = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        sent += chunk.length;
        opts.onProgress?.(f.name, sent, f.size);
        cb(null, chunk);
      },
    });
    raw.on('error', (err) => counter.destroy(err));

    let result;
    try {
      result = await opts.bee.uploadFile(opts.batchId, raw.pipe(counter), f.name, {
        size: f.size,
        deferred: opts.deferred,
        contentType: 'application/octet-stream',
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 402 || /\b402\b/.test(String(err))) {
        throw new Error(
          `Postage batch out of capacity/funds (HTTP 402) while uploading ${f.name}. ` +
            `The batch ${opts.batchId.slice(0, 16)}… is full or expired — buy a new ` +
            `(ideally mutable) batch, or pass a different --batch-id.`,
        );
      }
      throw err;
    }
    const file: ManifestFile = { name: f.name, reference: result.reference.toHex(), size: f.size };
    files.push(file);
    opts.onFile?.(file);
  }
  return files;
}
