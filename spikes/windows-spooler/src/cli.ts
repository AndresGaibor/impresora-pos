import { parseArgs } from './parse';
import { listPrinters, sendRaw } from './probe-native';

async function runCli(): Promise<void> {
  const args = parseArgs(process.argv);

  if (process.platform !== 'win32') {
    console.error('error: native printer API requires win32; use cross-OS helper boundary');
    process.exit(1);
  }

  switch (args.command) {
    case 'list': {
      const printers = listPrinters();
      console.log(JSON.stringify(printers, null, 2));
      break;
    }
    case 'probe':
    case 'send': {
      if (!args.printer) {
        console.error('error: --printer required');
        process.exit(1);
      }
      const bytes = Buffer.from(args.data ?? '');
      const result = await sendRaw(args.printer, bytes);
      console.log(JSON.stringify(result));
      break;
    }
  }
}

runCli().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
