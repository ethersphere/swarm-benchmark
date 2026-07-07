/**
 * `run` — full test case in one command: generate → traffic → report.
 *
 * Methods:
 *   measure (default) — DEFERRED-upload to the upload node, then immediately
 *     download from the download node in one process. Needed on a fully-
 *     replicating mesh (e.g. bee-factory, storageRadius=0) where a normal upload
 *     lets the download node cache the chunks and serve them for free.
 *   split — canonical/mainnet flow: fully-synced upload, then download from a
 *     node that isn't in the chunks' neighborhood and so pays for retrieval.
 */

import path from 'node:path';
import ora from 'ora';
import type { CommandModule } from 'yargs';
import { makeBee } from '../lib/bee';
import { DATASET_TYPES, type DatasetType } from '../lib/dataset';
import { generateDataset } from '../lib/generate';
import { uploadDataset } from '../lib/upload';
import { resolveBatchId } from '../lib/postage';
import { runDownload } from '../lib/runner';
import { renderChart } from '../lib/chart';
import { readRecords } from '../lib/records';
import { formatBytes } from '../lib/units';
import type { DownloadMode } from '../lib/records';

interface Args {
  type: DatasetType;
  count?: number;
  method: 'measure' | 'split';
  mode: DownloadMode;
  uploadBeeUrl: string;
  downloadBeeUrl: string;
  batchId?: string;
  outDir: string;
  sampleInterval: number;
  settle: number;
  retries: number;
}

function runStamp(): string {
  // 2026-07-06T16:21:10.123Z -> 20260706-162110
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

export const runCommand: CommandModule<unknown, Args> = {
  command: 'run <type>',
  describe: 'Full test case: generate a dataset, run measured traffic, render a report',
  builder: (yargs) =>
    yargs
      .positional('type', {
        describe: 'Dataset type',
        choices: DATASET_TYPES,
        demandOption: true,
      })
      .option('count', {
        alias: 'n',
        type: 'number',
        describe: 'Number of files (default: 1 for large-file, else 24)',
      })
      .option('method', {
        type: 'string',
        choices: ['measure', 'split'] as const,
        default: 'measure' as const,
        describe: 'measure = deferred upload + immediate download (local mesh); split = synced upload then download (mainnet)',
      })
      .option('mode', {
        type: 'string',
        choices: ['serial', 'burst'] as const,
        default: 'burst' as const,
        describe: 'Download one-at-a-time (serial) or in parallel (burst)',
      })
      .option('upload-bee-url', {
        type: 'string',
        default: process.env.BEE_UPLOAD_URL ?? 'http://localhost:1633',
        describe: 'Bee node to upload to',
      })
      .option('download-bee-url', {
        type: 'string',
        default: process.env.BEE_DOWNLOAD_URL ?? 'http://localhost:1633',
        describe: 'Bee node to download from (should differ from the upload node)',
      })
      .option('batch-id', {
        type: 'string',
        default: process.env.SWARM_BATCH_ID,
        describe: 'Postage batch id (default SWARM_BATCH_ID, else auto-detect a usable batch)',
      })
      .option('out-dir', {
        alias: 'o',
        type: 'string',
        default: 'runs',
        describe: 'Root directory for run output (a timestamped subdir is created)',
      })
      .option('sample-interval', { type: 'number', default: 0.5, describe: 'Seconds between samples' })
      .option('settle', { type: 'number', default: 60, describe: 'Seconds to sample after downloads finish' })
      .option('retries', { type: 'number', default: 3, describe: 'Retries for a 404 (deferred-race straggler)' }) as never,
  handler: async (args) => {
    const count = args.count ?? (args.type === 'large-file' ? 1 : 24);

    if (args.method === 'measure' && args.uploadBeeUrl === args.downloadBeeUrl) {
      console.warn(
        '⚠  upload and download nodes are identical — the download node already ' +
          'stores the chunks, so retrieval will be free (no cost measured).\n',
      );
    }

    const uploadBee = makeBee(args.uploadBeeUrl);
    const downloadBee = makeBee(args.downloadBeeUrl);

    // Preflight: both nodes reachable.
    try {
      await Promise.all([uploadBee.getHealth(), downloadBee.getHealth()]);
    } catch (err) {
      throw new Error(
        `A Bee node is not reachable (${args.uploadBeeUrl} / ${args.downloadBeeUrl}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    const batchId = await resolveBatchId(uploadBee, args.batchId);

    const runDir = path.join(args.outDir, `${runStamp()}-${args.type}-${args.mode}`);
    const datasetDir = path.join(runDir, 'dataset');
    const recordsPath = path.join(runDir, 'records.json');
    const chartPath = path.join(runDir, 'report.png');

    console.log(
      `\n  method        ${args.method}\n` +
        `  dataset       ${args.type} x ${count}\n` +
        `  mode          ${args.mode}\n` +
        `  upload  node  ${args.uploadBeeUrl}\n` +
        `  download node ${args.downloadBeeUrl}\n` +
        `  batch         ${batchId.slice(0, 16)}…\n` +
        `  output        ${runDir}\n`,
    );

    // 1. generate
    const genSpinner = ora('Generating dataset…').start();
    const { totalBytes } = await generateDataset(args.type, count, datasetDir, {
      onProgress: (spec, written) => {
        genSpinner.text = `Generating ${spec.name} · ${Math.floor((100 * written) / spec.size)}%`;
      },
    });
    genSpinner.succeed(`Generated ${count} file(s), ${formatBytes(totalBytes)}`);

    // 2. traffic (upload + download)
    const deferred = args.method === 'measure';
    const upSpinner = ora(`Uploading to ${args.uploadBeeUrl} (${deferred ? 'deferred' : 'synced'})…`).start();
    const files = await uploadDataset({
      bee: uploadBee,
      datasetDir,
      batchId,
      deferred,
      onProgress: (name, sent, total) => {
        upSpinner.text =
          sent < total
            ? `Uploading ${name} · ${Math.floor((100 * sent) / total)}%`
            : `Uploading ${name} · node storing chunks…`;
      },
    });
    upSpinner.succeed(`Uploaded ${files.length} file(s) to ${args.uploadBeeUrl}`);

    await runDownload({
      mode: args.mode,
      files,
      outPath: recordsPath,
      beeUrl: args.downloadBeeUrl,
      sampleIntervalMs: Math.round(args.sampleInterval * 1000),
      settleMs: Math.round(args.settle * 1000),
      notFoundRetries: args.retries,
    });

    // 3. report
    const reportSpinner = ora('Rendering report…').start();
    const records = await readRecords(recordsPath);
    await renderChart(records, chartPath);
    reportSpinner.succeed('Report rendered');

    console.log(`\n✓ Done\n  records: ${recordsPath}\n  chart:   ${chartPath}`);
  },
};
