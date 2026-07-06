/** Orchestrates a serial or burst download run with sampling + settle window. */

import { setTimeout as delay } from 'node:timers/promises';
import { makeBee, isChequebookEnabled } from './bee.js';
import { downloadWithProgress } from './download.js';
import { Sampler } from './sampler.js';
import { writeRecords } from './records.js';
import type { DownloadMode, FileRecord, Records } from './records.js';
import type { ManifestFile } from './manifest.js';
import { formatBytes } from './units.js';
import { printSummary } from './summary.js';

export interface RunOptions {
  mode: DownloadMode;
  files: ManifestFile[];
  outPath: string;
  beeUrl: string;
  sampleIntervalMs: number;
  settleMs: number;
}

export async function runDownload(opts: RunOptions): Promise<void> {
  if (!opts.files.length) {
    throw new Error('No files to download.');
  }

  const bee = makeBee(opts.beeUrl);
  const chequebookEnabled = await isChequebookEnabled(bee);
  console.log(
    `Download node: ${opts.beeUrl} (chequebook ${chequebookEnabled ? 'enabled' : 'disabled'})`,
  );
  console.log(
    `Mode: ${opts.mode} · ${opts.files.length} file(s) · sampling every ${
      opts.sampleIntervalMs / 1000
    }s\n`,
  );

  const files: FileRecord[] = opts.files.map((f) => ({
    name: f.name,
    reference: f.reference,
    size: f.size,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    bytesDownloaded: 0,
    error: null,
  }));

  const perFile: Record<string, number> = {};
  for (const f of files) perFile[f.name] = 0;

  const records: Records = {
    mode: opts.mode,
    startedAt: '',
    finishedAt: '',
    downloadBeeUrl: opts.beeUrl,
    sampleIntervalMs: opts.sampleIntervalMs,
    settleMs: opts.settleMs,
    chequebookEnabled,
    files,
    progressSamples: [],
    chequebookSamples: [],
    balanceSamples: [],
  };

  const t0 = Date.now();
  records.startedAt = new Date(t0).toISOString();

  const sampler = new Sampler({
    bee,
    chequebookEnabled,
    intervalMs: opts.sampleIntervalMs,
    t0,
    getProgress: () => ({
      totalBytes: Object.values(perFile).reduce((a, b) => a + b, 0),
      perFile,
    }),
    progressSamples: records.progressSamples,
    chequebookSamples: records.chequebookSamples,
    balanceSamples: records.balanceSamples,
  });
  sampler.start();

  const runOne = async (rec: FileRecord): Promise<void> => {
    const start = Date.now();
    rec.startedAt = new Date(start).toISOString();
    try {
      await downloadWithProgress(bee, rec.reference, (delta) => {
        perFile[rec.name] += delta;
        rec.bytesDownloaded += delta;
      });
    } catch (err) {
      rec.error = err instanceof Error ? err.message : String(err);
    }
    rec.durationMs = Date.now() - start;
    rec.finishedAt = new Date().toISOString();
    const status = rec.error ? `FAILED (${rec.error})` : formatBytes(rec.bytesDownloaded);
    console.log(`  ${rec.name}: ${status} in ${(rec.durationMs / 1000).toFixed(1)}s`);
  };

  if (opts.mode === 'serial') {
    for (const rec of files) await runOne(rec);
  } else {
    await Promise.allSettled(files.map(runOne));
  }

  console.log(
    `\nDownloads finished. Settling ${
      opts.settleMs / 1000
    }s to capture late cheques...`,
  );
  await delay(opts.settleMs);

  await sampler.stop();
  records.finishedAt = new Date().toISOString();

  await writeRecords(opts.outPath, records);
  console.log(`\nWrote records to ${opts.outPath}`);
  printSummary(records);
}
