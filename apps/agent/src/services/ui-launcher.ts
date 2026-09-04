import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class UiLauncher {
  constructor(private readonly executablePath = process.env.IMPRESORA_POS_GUI_PATH ?? join(process.cwd(), 'impresora-pos.exe')) {}
  launch(args: string[] = []): void {
    if (!existsSync(this.executablePath)) throw new Error('GUI_NOT_INSTALLED');
    const child = spawn(this.executablePath, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  }
}
