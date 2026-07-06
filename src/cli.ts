import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generateCommand } from './commands/generate';
import { uploadCommand } from './commands/upload';
import { serialDownloadCommand, burstDownloadCommand } from './commands/download';
import { measureCommand } from './commands/measure';
import { runCommand } from './commands/run';
import { reportCommand } from './commands/report';

const cli = yargs(hideBin(process.argv))
  .scriptName('swarm-bench')
  .usage('$0 <command> [options]')
  .command(generateCommand)
  .command(uploadCommand)
  .command(serialDownloadCommand)
  .command(burstDownloadCommand)
  .command(measureCommand)
  .command(runCommand)
  .command(reportCommand)
  .demandCommand(1, 'Specify a command.')
  .strict()
  .help()
  .alias('h', 'help')
  .fail((msg, err, y) => {
    if (err) {
      console.error(err.message);
    } else {
      // Usage error (e.g. unknown command): show help, then the message.
      y.showHelp('log');
      console.error(`\n${msg}`);
    }
    process.exit(1);
  });

// Bare `swarm-bench` with no subcommand: print help and exit cleanly.
if (hideBin(process.argv).length === 0) {
  cli.showHelp('log');
  process.exit(0);
}

cli.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
