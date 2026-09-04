import { contextBridge, ipcRenderer } from 'electron';
import { createBridge, FUTURE_BRIDGE_ALLOWLIST } from './bridge';

export { FUTURE_BRIDGE_ALLOWLIST };

contextBridge.exposeInMainWorld('impresoraPos', Object.freeze(createBridge((channel, ...args) => ipcRenderer.invoke(channel, ...args))));
contextBridge.exposeInMainWorld('impresoraPosEvents', Object.freeze({
  onOpenDiagnostics: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on('impresora:open-diagnostics', handler);
    return () => ipcRenderer.removeListener('impresora:open-diagnostics', handler);
  },
}));
