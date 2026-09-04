import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { expect as runtimeExpect } from 'bun:test';
import { createBridge, FUTURE_BRIDGE_ALLOWLIST } from '../electron/bridge';

const preloadPath = new URL('../electron/preload.ts', import.meta.url);
const bridgePath = new URL('../electron/bridge.ts', import.meta.url);
const mainPath = new URL('../electron/main.ts', import.meta.url);

test('preload exposes the minimal named API and no privileged globals', async () => {
  const preload = await readFile(preloadPath, 'utf8');
  const bridge = await readFile(bridgePath, 'utf8');
  const main = await readFile(mainPath, 'utf8');
  const names = [
    'createPairingCode', 'discoverPrinters', 'exportDiagnostics', 'getDashboard',
    'getProfiles', 'getTemplates', 'probePrinter', 'saveProfile', 'saveTemplate',
    'submitTestPrint',
  ];

  expect(names.every(name => bridge.includes(name))).toBe(true);
  expect(preload).toContain('contextBridge.exposeInMainWorld');
  expect(preload).toContain('Object.freeze');
  expect(preload).not.toMatch(/node:|require\(/);
  expect(preload).not.toMatch(/Bearer|token|credential/i);
  expect(main).toContain('ipcMain.handle');
  expect(main).toContain('devTools: false');
});

test('renderer source does not import Electron or Node', async () => {
  const app = await readFile(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  expect(app).not.toMatch(/from ['"](?:electron|node:)/);
  expect(app).not.toMatch(/import\(['"](?:electron|node:)/);
});

test('runtime bridge keys are exactly the typed allowlist', () => {
  const windowLike = { impresoraPos: createBridge(async () => undefined) };
  runtimeExpect(Object.keys(windowLike.impresoraPos).sort()).toEqual([...FUTURE_BRIDGE_ALLOWLIST].sort());
  runtimeExpect(JSON.stringify(windowLike.impresoraPos)).not.toContain('Bearer');
  runtimeExpect(JSON.stringify(windowLike.impresoraPos)).not.toMatch(/rawBytes|Uint8Array|ArrayBuffer/);
});
