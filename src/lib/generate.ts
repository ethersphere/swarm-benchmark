/** Generate a randomized local dataset + its dataset.json. */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DATASET_FILE,
  planDataset,
  type DatasetFileSpec,
  type DatasetManifest,
  type DatasetType,
} from './dataset';
import { writeRandomFile } from './random';

export interface GenerateResult {
  outDir: string;
  specs: DatasetFileSpec[];
  totalBytes: number;
}

export async function generateDataset(
  type: DatasetType,
  count: number,
  outDir: string,
  onFile?: (spec: DatasetFileSpec, durationMs: number) => void,
): Promise<GenerateResult> {
  const specs = planDataset(type, count);
  await mkdir(outDir, { recursive: true });

  let totalBytes = 0;
  for (const spec of specs) {
    const start = Date.now();
    await writeRandomFile(path.join(outDir, spec.name), spec.size);
    totalBytes += spec.size;
    onFile?.(spec, Date.now() - start);
  }

  const manifest: DatasetManifest = { type, createdAt: new Date().toISOString(), files: specs };
  await writeFile(path.join(outDir, DATASET_FILE), JSON.stringify(manifest, null, 2));

  return { outDir, specs, totalBytes };
}
