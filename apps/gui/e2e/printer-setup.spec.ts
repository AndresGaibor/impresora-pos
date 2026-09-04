import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('printer setup keeps discovery and probing user-driven', async () => {
  const source = await readFile(new URL('../src/features/printers/PrinterWizard.tsx', import.meta.url), 'utf8');
  expect(source).not.toMatch(/setInterval|setTimeout/);
  expect(source).toContain("discoverPrinters('system')");
  expect(source).toContain('onClick={() => void discover()}');
  expect(source).toContain('onClick={() => void probeNetwork()}');
  expect(source).toContain('api.saveProfile');
});

test('printer setup E2E is source-level because this repository has no Electron browser runner', async () => {
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  expect(packageJson).not.toContain('playwright');
});
