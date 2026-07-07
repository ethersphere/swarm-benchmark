/** `serial-download` and `burst-download` — measure downloads while sampling. */

import type { CommandModule } from 'yargs';
import { runDownload } from '../lib/runner';
import { readManifest } from '../lib/manifest';
import type { DownloadMode } from '../lib/records';

interface Args {
  manifest: string;
  out: string;
  beeUrl: string;
  sampleInterval: number;
  settle: number;
  retries: number;
}

function makeCommand(
  mode: DownloadMode,
  command: string,
  describe: string,
): CommandModule<unknown, Args> {
  return {
    command,
    describe,
    builder: (yargs) =>
      yargs
        .option('manifest', {
          alias: 'i',
          type: 'string',
          demandOption: true,
          describe: 'Upload manifest (from `upload`) with references to download',
        })
        .option('out', {
          alias: 'o',
          type: 'string',
          default: 'records.json',
          describe: 'Output records file (.json or .csv)',
        })
        .option('bee-url', {
          type: 'string',
          default: process.env.BEE_DOWNLOAD_URL ?? 'http://localhost:1633',
          describe: 'Bee node to download from (should differ from the upload node)',
        })
        .option('sample-interval', {
          type: 'number',
          default: 1,
          describe: 'Seconds between chequebook/progress samples',
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
      const manifest = await readManifest(args.manifest);
      await runDownload({
        mode,
        files: manifest.files,
        outPath: args.out,
        beeUrl: args.beeUrl,
        sampleIntervalMs: Math.round(args.sampleInterval * 1000),
        settleMs: Math.round(args.settle * 1000),
        notFoundRetries: args.retries,
      });
    },
  };
}

export const serialDownloadCommand = makeCommand(
  'serial',
  'serial-download',
  'Download files one at a time, sampling chequebook + progress',
);

export const burstDownloadCommand = makeCommand(
  'burst',
  'burst-download',
  'Download all files in parallel, sampling chequebook + progress',
);
