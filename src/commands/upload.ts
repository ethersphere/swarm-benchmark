/** `upload` — push a generated dataset to a Bee node, producing a manifest. */

import ora from 'ora';
import type { CommandModule } from 'yargs';
import { makeBee } from '../lib/bee';
import { writeManifest } from '../lib/manifest';
import { uploadDataset } from '../lib/upload';

interface Args {
  dataset: string;
  beeUrl: string;
  batchId?: string;
  out: string;
  deferred: boolean;
}

export const uploadCommand: CommandModule<unknown, Args> = {
  command: 'upload',
  describe: 'Upload a generated dataset to Swarm and write a reference manifest',
  builder: (yargs) =>
    yargs
      .option('dataset', {
        alias: 'i',
        type: 'string',
        demandOption: true,
        describe: 'Dataset directory (containing dataset.json)',
      })
      .option('bee-url', {
        type: 'string',
        default: process.env.BEE_UPLOAD_URL ?? 'http://localhost:1633',
        describe: 'Bee node to upload to',
      })
      .option('batch-id', {
        type: 'string',
        default: process.env.SWARM_BATCH_ID,
        describe: 'Postage batch id (or set SWARM_BATCH_ID)',
      })
      .option('out', {
        alias: 'o',
        type: 'string',
        default: 'manifest.json',
        describe: 'Output manifest path',
      })
      .option('deferred', {
        type: 'boolean',
        default: false,
        describe:
          'Deferred upload (return before data is pushed to the network). ' +
          'Default false so data is retrievable network-wide before measuring.',
      }) as never,
  handler: async (args) => {
    if (!args.batchId) {
      throw new Error('A postage batch id is required (--batch-id or SWARM_BATCH_ID).');
    }

    const bee = makeBee(args.beeUrl);
    const spinner = ora(`Uploading dataset to ${args.beeUrl}…`).start();

    const files = await uploadDataset({
      bee,
      datasetDir: args.dataset,
      batchId: args.batchId,
      deferred: args.deferred,
      onProgress: (name, sent, total) => {
        spinner.text =
          sent < total
            ? `Uploading ${name} · ${Math.floor((100 * sent) / total)}%`
            : `Uploading ${name} · node storing chunks…`;
      },
    });
    spinner.succeed(`Uploaded ${files.length} file(s) to ${args.beeUrl}`);

    await writeManifest(args.out, {
      uploadedAt: new Date().toISOString(),
      beeUrl: args.beeUrl,
      batchId: args.batchId,
      files,
    });
    console.log(`Wrote manifest to ${args.out}`);
  },
};
