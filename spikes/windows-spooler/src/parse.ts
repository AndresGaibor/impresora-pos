export interface CliArgs {
  command: 'list' | 'send' | 'probe';
  printer?: string;
  data?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  if (args[0] === '--list') return { command: 'list' };

  let command: CliArgs['command'] = 'send';
  let printer: string | undefined;
  let data: string | undefined;

  if (args[0] === '--send' || args[0] === 'send' || args[0] === 'probe' || args[0] === '--probe') {
    if (args[0] === 'probe' || args[0] === '--probe') command = 'probe';
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--printer' || args[i] === '-p') printer = args[++i];
      else if (args[i] === '--data' || args[i] === '-d') data = args[++i];
      else if (args[i] === 'RAW' || args[i] === 'TEXT') command = 'probe';
    }
    return { command, printer, data };
  }

  return { command: 'list' };
}
