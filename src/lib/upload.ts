/** Stream a generated dataset to a Bee node, producing reference records. */

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Bee } from '@ethersphere/bee-js';
import { DATASET_FILE, type DatasetManifest } from './dataset.js';
import type { ManifestFile } from './manifest.js';

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
  /** Called after each file uploads, for progress output. */
  onFile?: (file: ManifestFile) => void;
}

export async function uploadDataset(opts: UploadDatasetOptions): Promise<ManifestFile[]> {
  const datasetJson = path.join(opts.datasetDir, DATASET_FILE);
  const dataset = JSON.parse(await readFile(datasetJson, 'utf8')) as DatasetManifest;

  const files: ManifestFile[] = [];
  for (const f of dataset.files) {
    const stream = createReadStream(path.join(opts.datasetDir, f.name));
    const result = await opts.bee.uploadFile(opts.batchId, stream, f.name, {
      size: f.size,
      deferred: opts.deferred,
      contentType: 'application/octet-stream',
    });
    const file: ManifestFile = { name: f.name, reference: result.reference.toHex(), size: f.size };
    files.push(file);
    opts.onFile?.(file);
  }
  return files;
}
