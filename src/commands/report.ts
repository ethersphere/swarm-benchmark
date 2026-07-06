/** `report` — chart download progress + chequebook balance and print stats. */

import type { CommandModule } from 'yargs';
import { renderChart } from '../lib/chart.js';
import { readRecords } from '../lib/records.js';
import { printSummary } from '../lib/summary.js';

interface Args {
  input: string;
  output: string;
}

export const reportCommand: CommandModule<unknown, Args> = {
  command: 'report',
  describe: 'Render a PNG chart and print stats from a records file',
  builder: (yargs) =>
    yargs
      .option('input', {
        alias: 'i',
        type: 'string',
        demandOption: true,
        describe: 'Records file produced by a download command (.json)',
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        default: 'report.png',
        describe: 'Output PNG path',
      }) as never,
  handler: async (args) => {
    const records = await readRecords(args.input);
    await renderChart(records, args.output);
    console.log(`Wrote chart to ${args.output}`);
    printSummary(records);
  },
};
