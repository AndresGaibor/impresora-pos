import { existsSync } from 'node:fs';
import { join } from 'node:path';

const helper = join(import.meta.dir, '../../../native/windows-print-helper/out/helper.exe');
if (!existsSync(helper)) {
  console.error(`Missing native print helper: ${helper}`);
  console.error('Build it with: dotnet build native/windows-print-helper -c Release -o native/windows-print-helper/out');
  process.exit(1);
}

console.log(`Native print helper ready: ${helper}`);
