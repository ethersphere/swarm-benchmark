/** `serial-download` and `burst-download` — measure downloads while sampling. */

import type { CommandModule } from 'yargs';
import { runDownload } from '../lib/runner.js';
import { readManifest } from '../lib/manifest.js';
import type { DownloadMode } from '../lib/records.js';

interface Args {
  manifest: string;
  out: string;
  beeUrl: string;
  sampleInterval: number;
  settle: number;
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
