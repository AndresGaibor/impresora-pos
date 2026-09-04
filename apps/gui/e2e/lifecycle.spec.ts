import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

const mainPath = new URL('../electron/main.ts', import.meta.url);
const preloadPath = new URL('../electron/preload.ts', import.meta.url);

test('GUI lifecycle is on-demand and does not spawn resident processes', async () => {
  const main = await readFile(mainPath, 'utf8');
  const preload = await readFile(preloadPath, 'utf8');

  expect(main).not.toMatch(/(?:child_process|Bun\.spawn|spawn\(|exec\(|fork\()/);
  expect(main).toContain("window-all-closed");
  expect(main).toContain("app.quit()");
  expect(main).toContain('contextIsolation: true');
  expect(main).toContain('nodeIntegration: false');
  expect(main).toContain('sandbox: true');
  expect(main).toContain('setWindowOpenHandler');
  expect(main).toContain('will-navigate');

  expect(preload).not.toMatch(/(?:child_process|Bun\.spawn|spawn\(|exec\(|fork\()/);
  expect(preload).toContain('contextBridge.exposeInMainWorld');
  expect(preload).toContain('impresoraPos');
  expect(preload).toContain('FUTURE_BRIDGE_ALLOWLIST');
  expect(preload).toContain('Object.freeze');
});

test('renderer bridge exposes only named capabilities in Task 2', async () => {
  const preload = await readFile(preloadPath, 'utf8');
  const bridge = await readFile(new URL('../electron/bridge.ts', import.meta.url), 'utf8');
  expect(preload).toContain('FUTURE_BRIDGE_ALLOWLIST');
  expect(bridge).toContain('createPairingCode');
  expect(preload).not.toContain('fetch');
});
