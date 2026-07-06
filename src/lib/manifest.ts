/** Upload manifest types + read/write. */

import { readFile, writeFile } from 'node:fs/promises';

export interface ManifestFile {
  name: string;
  reference: string;
  size: number;
}

export interface UploadManifest {
  uploadedAt: string;
  beeUrl: string;
  batchId: string;
  files: ManifestFile[];
}

export async function readManifest(path: string): Promise<UploadManifest> {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as UploadManifest;
  if (!manifest.files?.length) {
    throw new Error(`Manifest ${path} has no files.`);
  }
  return manifest;
}

export async function writeManifest(path: string, manifest: UploadManifest): Promise<void> {
  await writeFile(path, JSON.stringify(manifest, null, 2));
}
