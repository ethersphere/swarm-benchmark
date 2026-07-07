import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeRandomFile } from '../../src/lib/random';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sb-random-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeRandomFile', () => {
  it('writes exactly the requested size', async () => {
    const p = path.join(dir, 'f.bin');
    await writeRandomFile(p, 5000);
    expect((await readFile(p)).length).toBe(5000);
  });

  it('produces unique 4 KB chunks (defeats Bee dedup)', async () => {
    const p = path.join(dir, 'f.bin');
    await writeRandomFile(p, 4096 * 12);
    const buf = await readFile(p);
    const chunks = new Set<string>();
    for (let i = 0; i < buf.length; i += 4096) {
      chunks.add(buf.subarray(i, i + 4096).toString('hex'));
    }
    expect(chunks.size).toBe(12);
  });

  it('two files with the same size differ byte-for-byte', async () => {
    const a = path.join(dir, 'a.bin');
    const b = path.join(dir, 'b.bin');
    await writeRandomFile(a, 8192);
    await writeRandomFile(b, 8192);
    expect(Buffer.compare(await readFile(a), await readFile(b))).not.toBe(0);
  });

  it('reports monotonic byte progress ending at the total size', async () => {
    const seen: number[] = [];
    await writeRandomFile(path.join(dir, 'f.bin'), 3_000_000, (w) => seen.push(w));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(3_000_000);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
  });
});
