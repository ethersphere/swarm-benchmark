/**
 * `measure` — one-shot cost measurement: deferred-upload a dataset to one node,
 * wait for the chunks to propagate/settle (`--propagation-wait`, default 60s),
 * then download it from another node so retrieval crosses the network and
 * incurs cheques/accounting debt.
 *
 * Note: on a fully-replicating mesh (bee-factory, storageRadius=0) a long wait
 * lets the chunks reach the download node too, making retrieval free — set
 * `--propagation-wait 0` there to download before replication and still see cost.
 */

import { setTimeout as delay } from 'node:timers/promises';
import ora from 'ora';
import type { CommandModule } from 'yargs';
import { makeBee } from '../lib/bee';
import { uploadDataset } from '../lib/upload';
import { runDownload } from '../lib/runner';
import { renderChart } from '../lib/chart';
import { readRecords } from '../lib/records';
import type { DownloadMode } from '../lib/records';

interface Args {
  dataset: string;
  uploadBeeUrl: string;
  downloadBeeUrl: string;
  batchId?: string;
  mode: DownloadMode;
  out: string;
  report?: string;
  propagationWait: number;
  sampleInterval: number;
  settle: number;
  retries: number;
}

/** Sleep with a live countdown spinner so chunks can propagate/settle. */
async function propagationWait(seconds: number): Promise<void> {
  const ms = Math.round(seconds * 1000);
  if (ms <= 0) return;
  const spinner = ora(`Waiting ${seconds}s for chunks to propagate…`).start();
  const end = Date.now() + ms;
  const timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    spinner.text = `Waiting ${left}s for chunks to propagate…`;
  }, 500);
  await delay(ms);
  clearInterval(timer);
  spinner.succeed('Propagation wait complete');
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
      .option('propagation-wait', {
        type: 'number',
        default: 60,
        describe: 'Seconds to wait after upload for chunks to propagate/settle before downloading (raise for multi-GB datasets; 0 to download immediately)',
      })
      .option('settle', {
        type: 'number',
        default: 60,
        describe: 'Seconds to keep sampling after downloads finish (late cheques)',
      })
      .option('retries', {
        type: 'number',
        default: 3,
        describe: 'Retries for a 404 (deferred-race straggler not yet retrievable)',
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
    const upSpinner = ora(`Uploading to ${args.uploadBeeUrl} (deferred)…`).start();
    const files = await uploadDataset({
      bee: uploadBee,
      datasetDir: args.dataset,
      batchId: args.batchId,
      deferred: true,
      onProgress: (name, sent, total) => {
        upSpinner.text =
          sent < total
            ? `Uploading ${name} · ${Math.floor((100 * sent) / total)}%`
            : `Uploading ${name} · node storing chunks…`;
      },
    });
    upSpinner.succeed(`Uploaded ${files.length} file(s).`);

    // Let the just-uploaded chunks propagate/settle before downloading.
    await propagationWait(args.propagationWait);

    await runDownload({
      mode: args.mode,
      files,
      outPath: args.out,
      beeUrl: args.downloadBeeUrl,
      sampleIntervalMs: Math.round(args.sampleInterval * 1000),
      settleMs: Math.round(args.settle * 1000),
      notFoundRetries: args.retries,
    });

    if (args.report) {
      const reportSpinner = ora('Rendering report…').start();
      const records = await readRecords(args.out);
      await renderChart(records, args.report);
      reportSpinner.succeed(`Wrote chart to ${args.report}`);
    }
  },
};
