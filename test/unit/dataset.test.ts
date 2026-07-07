import { describe, it, expect } from 'vitest';
import { planDataset, DATASET_TYPES } from '../../src/lib/dataset';

describe('planDataset', () => {
  it('music-album: N files of 5,000,000 bytes (decimal 5 MB)', () => {
    const specs = planDataset('music-album', 3);
    expect(specs).toHaveLength(3);
    expect(specs.every((s) => s.size === 5_000_000)).toBe(true);
    expect(specs.map((s) => s.name)).toEqual(['track-0000.bin', 'track-0001.bin', 'track-0002.bin']);
  });

  it('large-file: N files of 1,000,000,000 bytes (decimal 1 GB)', () => {
    const specs = planDataset('large-file', 2);
    expect(specs.every((s) => s.size === 1_000_000_000)).toBe(true);
    expect(specs[0].name).toBe('large-0000.bin');
  });

  it('website: randomized sizes within [100 KB, 2 MB] decimal', () => {
    const specs = planDataset('website', 200);
    for (const s of specs) {
      expect(s.size).toBeGreaterThanOrEqual(100_000);
      expect(s.size).toBeLessThanOrEqual(2_000_000);
    }
    expect(new Set(specs.map((s) => s.size)).size).toBeGreaterThan(1);
    expect(specs[0].name).toBe('asset-0000.bin');
  });

  it('count 0 → empty', () => {
    expect(planDataset('music-album', 0)).toEqual([]);
  });

  it('exposes the three dataset types', () => {
    expect(DATASET_TYPES).toEqual(['music-album', 'website', 'large-file']);
  });
});
