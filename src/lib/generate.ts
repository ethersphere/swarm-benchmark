/** Generate a randomized local dataset + its dataset.json. */

import { mkdir, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DATASET_FILE,
  planDataset,
  type DatasetFileSpec,
  type DatasetManifest,
  type DatasetType,
} from './dataset';
import { writeRandomFile } from './random';
import { formatBytes } from './units';

/** Refuse to generate a dataset that won't fit on disk (with a small margin). */
async function assertDiskSpace(dir: string, needed: number): Promise<void> {
  let free: number;
  try {
    const stats = await statfs(dir);
    free = stats.bavail * stats.bsize;
  } catch {
    return; // statfs unsupported on this platform — skip the check
  }
  if (needed > free * 0.98) {
    throw new Error(
      `Dataset needs ${formatBytes(needed)} but only ${formatBytes(free)} is free in ${dir}. ` +
        `Reduce --count or free disk space (large-file is 1 GB per file).`,
    );
  }
}

export interface GenerateResult {
  outDir: string;
  specs: DatasetFileSpec[];
  totalBytes: number;
}

export interface GenerateHooks {
  onFileStart?: (spec: DatasetFileSpec, index: number, total: number) => void;
  onProgress?: (spec: DatasetFileSpec, written: number) => void;
  onFileDone?: (spec: DatasetFileSpec, durationMs: number) => void;
}

export async function generateDataset(
  type: DatasetType,
  count: number,
  outDir: string,
  hooks?: GenerateHooks,
): Promise<GenerateResult> {
  const specs = planDataset(type, count);
  await mkdir(outDir, { recursive: true });
  await assertDiskSpace(outDir, specs.reduce((sum, f) => sum + f.size, 0));

  let totalBytes = 0;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    hooks?.onFileStart?.(spec, i, specs.length);
    const start = Date.now();
    await writeRandomFile(path.join(outDir, spec.name), spec.size, (written) =>
      hooks?.onProgress?.(spec, written),
    );
    totalBytes += spec.size;
    hooks?.onFileDone?.(spec, Date.now() - start);
  }

  const manifest: DatasetManifest = { type, createdAt: new Date().toISOString(), files: specs };
  await writeFile(path.join(outDir, DATASET_FILE), JSON.stringify(manifest, null, 2));

  return { outDir, specs, totalBytes };
}
