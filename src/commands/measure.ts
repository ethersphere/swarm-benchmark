/**
 * `measure` — one-shot cost measurement: deferred-upload a dataset to one node,
 * then immediately download it from another, in a single process.
 *
 * Uploading deferred keeps the data on the upload node; downloading immediately
 * from a different node forces retrieval over the network (and cheques/accounting
 * debt) before pull-sync replicates the chunks to the download node. Doing both
 * in one process minimizes the gap so the download wins that race.
 */

import type { CommandModule } from 'yargs';
import { makeBee } from '../lib/bee.js';
import { uploadDataset } from '../lib/upload.js';
import { runDownload } from '../lib/runner.js';
import { renderChart } from '../lib/chart.js';
import { readRecords } from '../lib/records.js';
import { formatBytes } from '../lib/units.js';
import type { DownloadMode } from '../lib/records.js';

interface Args {
  dataset: string;
  uploadBeeUrl: string;
  downloadBeeUrl: string;
  batchId?: string;
  mode: DownloadMode;
  out: string;
  report?: string;
  sampleInterval: number;
  settle: number;
}

export const measureCommand: CommandModule<unknown, Args> = {
  command: 'measure',
  describe:
    'One-shot: deferred-upload a dataset then immediately download it from another node, ' +
    'so retrieval cost is actually incurred',
  builder: (yargs) =>
    yargs
      .option('dataset', {
        alias: 'i',
        type: 'string',
        demandOption: true,
        describe: 'Dataset directory (from `generate`, containing dataset.json)',
      })
      .option('upload-bee-url', {
        type: 'string',
        default: process.env.BEE_UPLOAD_URL ?? 'http://localhost:1633',
        describe: 'Bee node to upload to',
      })
      .option('download-bee-url', {
        type: 'string',
        default: process.env.BEE_DOWNLOAD_URL ?? 'http://localhost:1633',
        describe: 'Bee node to download from (must differ from the upload node)',
      })
      .option('batch-id', {
        type: 'string',
        default: process.env.SWARM_BATCH_ID,
        describe: 'Postage batch id (or set SWARM_BATCH_ID)',
      })
      .option('mode', {
        type: 'string',
        choices: ['serial', 'burst'] as const,
        default: 'burst' as const,
        describe: 'Download one-at-a-time (serial) or all in parallel (burst)',
      })
      .option('out', {
        alias: 'o',
        type: 'string',
        default: 'records.json',
        describe: 'Output records file (.json or .csv)',
      })
      .option('report', {
        alias: 'r',
        type: 'string',
        describe: 'Also render a PNG chart to this path',
      })
      .option('sample-interval', {
        type: 'number',
        default: 0.5,
        describe: 'Seconds between chequebook/progress samples',
      })
      .option('settle', {
        type: 'number',
        default: 60,
        describe: 'Seconds to keep sampling after downloads finish (late cheques)',
      }) as never,
  handler: async (args) => {
    if (!args.batchId) {
      throw new Error('A postage batch id is required (--batch-id or SWARM_BATCH_ID).');
    }
    if (args.uploadBeeUrl === args.downloadBeeUrl) {
      console.warn(
        'Warning: upload and download nodes are the same — the download node ' +
          'already stores the chunks, so retrieval will be free (no cost measured).\n',
      );
    }

    const uploadBee = makeBee(args.uploadBeeUrl);
    console.log(`Uploading dataset ${args.dataset} to ${args.uploadBeeUrl} (deferred)...`);
    const files = await uploadDataset({
      bee: uploadBee,
      datasetDir: args.dataset,
      batchId: args.batchId,
      deferred: true,
      onFile: (f) => process.stdout.write(`  + ${f.name} (${formatBytes(f.size)})\r`),
    });
    console.log(`\nUploaded ${files.length} file(s). Downloading immediately to win the race.\n`);

    await runDownload({
      mode: args.mode,
      files,
      outPath: args.out,
      beeUrl: args.downloadBeeUrl,
      sampleIntervalMs: Math.round(args.sampleInterval * 1000),
      settleMs: Math.round(args.settle * 1000),
    });

    if (args.report) {
      const records = await readRecords(args.out);
      await renderChart(records, args.report);
      console.log(`\nWrote chart to ${args.report}`);
    }
  },
};
