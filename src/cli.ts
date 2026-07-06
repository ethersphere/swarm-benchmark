#!/usr/bin/env node
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generateCommand } from './commands/generate.js';
import { uploadCommand } from './commands/upload.js';
import { serialDownloadCommand, burstDownloadCommand } from './commands/download.js';
import { measureCommand } from './commands/measure.js';
import { reportCommand } from './commands/report.js';

await yargs(hideBin(process.argv))
  .scriptName('swarm-bench')
  .usage('$0 <command> [options]')
  .command(generateCommand)
  .command(uploadCommand)
  .command(serialDownloadCommand)
  .command(burstDownloadCommand)
  .command(measureCommand)
  .command(reportCommand)
  .demandCommand(1, 'Specify a command. Use --help to list commands.')
  .strict()
  .help()
  .alias('h', 'help')
  .fail((msg, err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.error(msg);
    }
    process.exit(1);
  })
  .parseAsync();
