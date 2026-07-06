/** `generate` — create a randomized local dataset. */

import path from 'node:path';
import type { CommandModule } from 'yargs';
import { DATASET_TYPES, type DatasetType } from '../lib/dataset';
import { generateDataset } from '../lib/generate';
import { formatBytes } from '../lib/units';

interface Args {
  type: DatasetType;
  count: number;
  outDir?: string;
}

export const generateCommand: CommandModule<unknown, Args> = {
  command: 'generate <type>',
  describe: 'Generate a randomized local dataset (music-album | website | large-file)',
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
        default: 1,
        describe: 'Number of files to generate',
      })
      .option('out-dir', {
        alias: 'o',
        type: 'string',
        describe: 'Output directory (default: datasets/<type>)',
      }) as never,
  handler: async (args) => {
    const outDir = args.outDir ?? path.join('datasets', args.type);

    const { specs, totalBytes } = await generateDataset(
      args.type,
      args.count,
      outDir,
      (spec, durationMs) =>
        console.log(`generating ${spec.name} (${formatBytes(spec.size)}) ... done in ${(durationMs / 1000).toFixed(1)}s`),
    );

    console.log(`\nGenerated ${specs.length} file(s), ${formatBytes(totalBytes)} total in ${outDir}`);
  },
};
