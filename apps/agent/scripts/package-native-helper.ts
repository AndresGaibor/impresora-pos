import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const helper = join(import.meta.dir, '../../../native/windows-print-helper/out/helper.exe');
const destination = join(import.meta.dir, '../../../dist/windows/helper.exe');
if (!existsSync(helper)) throw new Error(`Missing native print helper: ${helper}`);
mkdirSync(join(import.meta.dir, '../../../dist/windows'), { recursive: true });
copyFileSync(helper, destination);
console.log(`Packaged native print helper: ${destination}`);
