/** Orchestrates a serial or burst download run with sampling + settle window. */

import { setTimeout as delay } from 'node:timers/promises';
import ora from 'ora';
import { makeBee, isChequebookEnabled } from './bee';
import { downloadWithProgress } from './download';
import { Sampler } from './sampler';
import { writeRecords } from './records';
import type { DownloadMode, FileRecord, Records } from './records';
import type { ManifestFile } from './manifest';
import { MB } from './units';
import { printSummary } from './summary';

export interface RunOptions {
  mode: DownloadMode;
  files: ManifestFile[];
  outPath: string;
  beeUrl: string;
  sampleIntervalMs: number;
  settleMs: number;
  /** Retries for a 404 (deferred-race straggler not yet retrievable). Default 3. */
  notFoundRetries?: number;
  notFoundRetryDelayMs?: number;
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

  const totalExpected = files.reduce((sum, f) => sum + f.size, 0) || 1;
  const spinner = ora('Downloading…').start();
  const progressTimer = setInterval(() => {
    const done = Object.values(perFile).reduce((a, b) => a + b, 0);
    const secs = (Date.now() - t0) / 1000;
    const doneFiles = files.filter((f) => f.finishedAt).length;
    spinner.text =
      `Downloading ${doneFiles}/${files.length} files · ` +
      `${(done / MB).toFixed(1)}/${(totalExpected / MB).toFixed(1)} MB ` +
      `(${Math.floor((100 * done) / totalExpected)}%) · ` +
      `${(done / MB / Math.max(secs, 0.001)).toFixed(1)} MB/s`;
  }, 200);

  const notFoundRetries = opts.notFoundRetries ?? 3;
  const notFoundRetryDelayMs = opts.notFoundRetryDelayMs ?? 2000;

  const runOne = async (rec: FileRecord): Promise<void> => {
    const start = Date.now();
    rec.startedAt = new Date(start).toISOString();
    for (let attempt = 0; ; attempt++) {
      try {
        await downloadWithProgress(bee, rec.reference, (delta) => {
          perFile[rec.name] += delta;
          rec.bytesDownloaded += delta;
        });
        rec.error = null;
        break;
      } catch (err) {
        rec.error = err instanceof Error ? err.message : String(err);
        const notFound = (err as { status?: number })?.status === 404 || /\b404\b/.test(String(err));
        // A deferred-race straggler is briefly unretrievable and 404s before any
        // bytes arrive; give it a moment. It's still absent from the download
        // node, so the retry still crosses the network (no cost skew).
        if (notFound && rec.bytesDownloaded === 0 && attempt < notFoundRetries) {
          await delay(notFoundRetryDelayMs);
          continue;
        }
        break;
      }
    }
    rec.durationMs = Date.now() - start;
    rec.finishedAt = new Date().toISOString();
  };

  if (opts.mode === 'serial') {
    for (const rec of files) await runOne(rec);
  } else {
    await Promise.allSettled(files.map(runOne));
  }

  clearInterval(progressTimer);
  const downloaded = Object.values(perFile).reduce((a, b) => a + b, 0);
  const failed = files.filter((f) => f.error);
  const summaryText = `Downloaded ${(downloaded / MB).toFixed(1)} MB across ${
    files.length - failed.length
  }/${files.length} file(s)`;
  if (failed.length) spinner.warn(summaryText);
  else spinner.succeed(summaryText);
  for (const f of failed) console.log(`    ✗ ${f.name}: ${f.error}`);

  // Keep sampling through the settle window with a live countdown.
  const settleSpinner = ora(`Settling ${opts.settleMs / 1000}s for late cheques…`).start();
  const settleEnd = Date.now() + opts.settleMs;
  const settleTimer = setInterval(() => {
    const left = Math.max(0, Math.ceil((settleEnd - Date.now()) / 1000));
    settleSpinner.text = `Settling ${left}s for late cheques…`;
  }, 500);
  await delay(opts.settleMs);
  clearInterval(settleTimer);
  settleSpinner.succeed('Settle window complete');

  await sampler.stop();
  records.finishedAt = new Date().toISOString();

  await writeRecords(opts.outPath, records);
  console.log(`\nWrote records to ${opts.outPath}`);
  printSummary(records);
}
