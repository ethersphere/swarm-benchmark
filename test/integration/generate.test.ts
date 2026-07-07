import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateCommand } from '../../src/commands/generate';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sb-generate-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('generate command', () => {
  it('writes N randomized files plus dataset.json', async () => {
    const out = path.join(dir, 'ds');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await generateCommand.handler!({ type: 'website', count: 3, outDir: out } as any);

    const entries = await readdir(out);
    expect(entries).toContain('dataset.json');
    expect(entries.filter((f) => f.endsWith('.bin'))).toHaveLength(3);

    const manifest = JSON.parse(await readFile(path.join(out, 'dataset.json'), 'utf8'));
    expect(manifest.type).toBe('website');
    expect(manifest.files).toHaveLength(3);
    for (const f of manifest.files) {
      expect((await readFile(path.join(out, f.name))).length).toBe(f.size);
    }
  });
});
