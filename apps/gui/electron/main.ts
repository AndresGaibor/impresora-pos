import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { AgentClient } from './agent-client';
import { readAdminCredential } from './credential';
import { DeviceSchema, ProfileSchema, TemplateSchema, TransportNameSchema } from '../src/app/agent-api';
import { withSanitizedIpcErrors } from './ipc-errors';
import { createAgentLauncher } from './agent-launcher';
import { DEFAULT_ADMIN_ORIGIN } from './agent-client';
import { hasDiagnosticsArg } from './instance-routing';

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  const window = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
      devTools: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(join(__dirname, '../dist/index.html'));
  mainWindow = window;
  if (hasDiagnosticsArg(process.argv)) window.webContents.once('did-finish-load', () => window.webContents.send('impresora:open-diagnostics'));
};

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    if (hasDiagnosticsArg(commandLine)) mainWindow.webContents.send('impresora:open-diagnostics');
  });
}

app.whenReady().then(async () => {
  if (!hasLock) return;
  const adminOrigin = process.env.IMPRESORA_POS_ADMIN_ORIGIN ?? DEFAULT_ADMIN_ORIGIN;
  const availability = await createAgentLauncher({
    lockPath: join(app.getPath('userData'), 'agent-start.lock'),
    env: { ...process.env, APPROVED_ORIGINS: adminOrigin },
  }).ensureAgentRunning();
  if (!availability.available) {
    console.error(availability.code);
    app.quit();
    return;
  }
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  const client = new AgentClient({ adminToken: readAdminCredential(process.env.IMPRESORA_POS_ADMIN_TOKEN_PATH ?? join(app.getPath('userData'), 'admin.token')), adminOrigin });
  const register = (channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (_event, ...args) => withSanitizedIpcErrors(() => handler(...args)));
  };
  register('impresora:getDashboard', () => client.getDashboard());
  register('impresora:getProfiles', () => client.getProfiles());
  register('impresora:getTemplates', () => client.getTemplates());
  register('impresora:createPairingCode', () => client.createPairingCode());
  register('impresora:discoverPrinters', transport => client.discoverPrinters(TransportNameSchema.parse(transport ?? 'network')));
  register('impresora:exportDiagnostics', limit => client.exportDiagnostics(typeof limit === 'number' ? limit : 20));
  register('impresora:probePrinter', input => { const value = input as { device?: unknown; transport?: unknown }; return client.probePrinter(DeviceSchema.parse(value.device), TransportNameSchema.parse(value.transport ?? 'network')); });
  register('impresora:saveProfile', profile => client.saveProfile(ProfileSchema.parse(profile)));
  register('impresora:saveTemplate', template => client.saveTemplate(TemplateSchema.parse(template)));
  register('impresora:submitTestPrint', profileId => client.submitTestPrint(typeof profileId === 'string' ? profileId : undefined));
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
