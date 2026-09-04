import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('first-run shell does not implement a background polling loop', async () => {
  const source = await readFile(new URL('../src/app/Shell.tsx', import.meta.url), 'utf8');
  expect(source).not.toMatch(/setInterval|setTimeout/);
  expect(source).toContain('localStorage');
  expect(source).toContain('getDashboard');
  expect(source).toContain("onOpenPrinters={() => navigate('printers')}");
  expect(source).toContain('Reintentar');
});

test('setup exposes the guided first-run action without hardware discovery', async () => {
  const source = await readFile(new URL('../src/features/setup/SetupPage.tsx', import.meta.url), 'utf8');
  expect(source).toContain('Comenzar configuración');
  expect(source).toContain('onOpenPrinters');
  expect(source).not.toMatch(/discoverPrinters|probePrinter|submitTestPrint/);
});

test('dashboard exposes degraded state and actionable refresh/error UI', async () => {
  const source = await readFile(new URL('../src/features/dashboard/DashboardPage.tsx', import.meta.url), 'utf8');
  expect(source).toContain("dashboard.status === 'degraded'");
  expect(source).toContain('Actualizar');
  expect(source).toContain('Comprueba que el servicio local esté iniciado');
});
