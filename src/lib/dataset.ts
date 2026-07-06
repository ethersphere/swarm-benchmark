/** Dataset specifications for the `generate` command. */

import { GB, KB, MB } from './units';

export const DATASET_TYPES = ['music-album', 'website', 'large-file'] as const;
export type DatasetType = (typeof DATASET_TYPES)[number];

/** Filename written alongside generated files describing the dataset. */
export const DATASET_FILE = 'dataset.json';

export interface DatasetFileSpec {
  name: string;
  size: number;
}

export interface DatasetManifest {
  type: DatasetType;
  createdAt: string;
  files: DatasetFileSpec[];
}

function pad(i: number): string {
  return String(i).padStart(4, '0');
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Plan the files for a dataset. Sizes:
 *  - music-album: N x 5 MB
 *  - website:     N x [100 KB, 2 MB] (randomized)
 *  - large-file:  N x 1 GB
 */
export function planDataset(type: DatasetType, count: number): DatasetFileSpec[] {
  const specs: DatasetFileSpec[] = [];
  for (let i = 0; i < count; i++) {
    switch (type) {
      case 'music-album':
        specs.push({ name: `track-${pad(i)}.bin`, size: 5 * MB });
        break;
      case 'website':
        specs.push({ name: `asset-${pad(i)}.bin`, size: randInt(100 * KB, 2 * MB) });
        break;
      case 'large-file':
        specs.push({ name: `large-${pad(i)}.bin`, size: GB });
        break;
    }
  }
  return specs;
}
