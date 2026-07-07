import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeFakeBee, type FakeBee } from '../helpers/fakeBee';

const h = vi.hoisted(() => ({ bee: undefined as unknown as FakeBee }));
vi.mock('../../src/lib/bee', () => ({ makeBee: () => h.bee, isChequebookEnabled: async () => true }));

import { uploadCommand } from '../../src/commands/upload';
import { generateDataset } from '../../src/lib/generate';

let dir: string;
let datasetDir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sb-upload-'));
  datasetDir = path.join(dir, 'ds');
  await generateDataset('website', 2, datasetDir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (args: any) => uploadCommand.handler!(args);

describe('upload command', () => {
  it('uploads each file and writes a reference manifest', async () => {
    h.bee = makeFakeBee({});
    const out = path.join(dir, 'manifest.json');
    await handler({ dataset: datasetDir, beeUrl: 'http://up', batchId: 'batch-1', out, deferred: false });

    const manifest = JSON.parse(await readFile(out, 'utf8'));
    expect(manifest.batchId).toBe('batch-1');
    expect(manifest.beeUrl).toBe('http://up');
    expect(manifest.files).toHaveLength(2);
    expect(manifest.files[0].reference).toBe('ref-asset-0000.bin');
    expect(h.bee.uploads).toHaveLength(2);
    expect(h.bee.uploads[0].deferred).toBe(false);
  });

  it('surfaces a clear error on HTTP 402 (batch full)', async () => {
    h.bee = makeFakeBee({ uploadError402: new Set(['asset-0000.bin']) });
    await expect(
      handler({ dataset: datasetDir, beeUrl: 'http://up', batchId: 'batch-1', out: path.join(dir, 'm.json'), deferred: false }),
    ).rejects.toThrow(/402/);
  });

  it('requires a postage batch id', async () => {
    h.bee = makeFakeBee({});
    await expect(
      handler({ dataset: datasetDir, beeUrl: 'http://up', batchId: undefined, out: path.join(dir, 'm.json'), deferred: false }),
    ).rejects.toThrow(/batch id/i);
  });
});
