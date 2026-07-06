/** `generate` — create a randomized local dataset. */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandModule } from 'yargs';
import {
  DATASET_FILE,
  DATASET_TYPES,
  planDataset,
  type DatasetManifest,
  type DatasetType,
} from '../lib/dataset.js';
import { writeRandomFile } from '../lib/random.js';
import { formatBytes } from '../lib/units.js';

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
    const specs = planDataset(args.type, args.count);

    await mkdir(outDir, { recursive: true });

    let total = 0;
    for (const spec of specs) {
      const filePath = path.join(outDir, spec.name);
      process.stdout.write(`generating ${spec.name} (${formatBytes(spec.size)}) ... `);
      const start = Date.now();
      await writeRandomFile(filePath, spec.size);
      total += spec.size;
      console.log(`done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    }

    const manifest: DatasetManifest = {
      type: args.type,
      createdAt: new Date().toISOString(),
      files: specs,
    };
    await writeFile(path.join(outDir, DATASET_FILE), JSON.stringify(manifest, null, 2));

    console.log(
      `\nGenerated ${specs.length} file(s), ${formatBytes(total)} total in ${outDir}`,
    );
  },
};
