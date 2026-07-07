import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeFakeBee, type FakeBee } from '../helpers/fakeBee';

const h = vi.hoisted(() => ({ bee: undefined as unknown as FakeBee }));
vi.mock('../../src/lib/bee', () => ({ makeBee: () => h.bee, isChequebookEnabled: async () => true }));

import { serialDownloadCommand, burstDownloadCommand } from '../../src/commands/download';
import type { Records } from '../../src/lib/records';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sb-download-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeManifest(): Promise<string> {
  const p = path.join(dir, 'manifest.json');
  await writeFile(
    p,
    JSON.stringify({
      uploadedAt: 't',
      beeUrl: 'http://up',
      batchId: 'b',
      files: [
        { name: 'a', reference: 'r1', size: 1000 },
        { name: 'b', reference: 'r2', size: 2000 },
      ],
    }),
  );
  return p;
}

describe('serial-download / burst-download commands', () => {
  it('serial: reads the manifest, downloads, and writes records', async () => {
    h.bee = makeFakeBee({ sizeByRef: { r1: 1000, r2: 2000 } });
    const manifest = await writeManifest();
    const out = path.join(dir, 'records.json');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await serialDownloadCommand.handler!({ manifest, out, beeUrl: 'http://dl', sampleInterval: 0.01, settle: 0, retries: 0 } as any);

    const rec = JSON.parse(await readFile(out, 'utf8')) as Records;
    expect(rec.mode).toBe('serial');
    expect(rec.downloadBeeUrl).toBe('http://dl');
    expect(rec.files.map((f) => f.bytesDownloaded)).toEqual([1000, 2000]);
  });

  it('burst: downloads all files and totals the bytes', async () => {
    h.bee = makeFakeBee({ sizeByRef: { r1: 1000, r2: 2000 } });
    const manifest = await writeManifest();
    const out = path.join(dir, 'records.json');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await burstDownloadCommand.handler!({ manifest, out, beeUrl: 'http://dl', sampleInterval: 0.01, settle: 0, retries: 0 } as any);

    const rec = JSON.parse(await readFile(out, 'utf8')) as Records;
    expect(rec.mode).toBe('burst');
    expect(rec.files.reduce((s, f) => s + f.bytesDownloaded, 0)).toBe(3000);
  });
});
