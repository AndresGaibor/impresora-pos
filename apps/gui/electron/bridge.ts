import type { ImpresoraPosApi } from '../src/app/agent-api';

export type BridgeKey = keyof ImpresoraPosApi;
export const FUTURE_BRIDGE_ALLOWLIST: readonly BridgeKey[] = Object.freeze([
  'createPairingCode', 'discoverPrinters', 'exportDiagnostics', 'getDashboard',
  'getProfiles', 'getTemplates', 'probePrinter', 'saveProfile', 'saveTemplate',
  'submitTestPrint',
]);

export type IpcInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

export function createBridge(invoke: IpcInvoke): ImpresoraPosApi {
  const bridge: ImpresoraPosApi = {
    createPairingCode: () => invoke('impresora:createPairingCode') as ReturnType<ImpresoraPosApi['createPairingCode']>,
    discoverPrinters: transport => invoke('impresora:discoverPrinters', transport) as ReturnType<ImpresoraPosApi['discoverPrinters']>,
    exportDiagnostics: limit => invoke('impresora:exportDiagnostics', limit) as ReturnType<ImpresoraPosApi['exportDiagnostics']>,
    getDashboard: () => invoke('impresora:getDashboard') as ReturnType<ImpresoraPosApi['getDashboard']>,
    getProfiles: () => invoke('impresora:getProfiles') as ReturnType<ImpresoraPosApi['getProfiles']>,
    getTemplates: () => invoke('impresora:getTemplates') as ReturnType<ImpresoraPosApi['getTemplates']>,
    probePrinter: (device, transport) => invoke('impresora:probePrinter', { device, transport }) as ReturnType<ImpresoraPosApi['probePrinter']>,
    saveProfile: profile => invoke('impresora:saveProfile', profile) as ReturnType<ImpresoraPosApi['saveProfile']>,
    saveTemplate: template => invoke('impresora:saveTemplate', template) as ReturnType<ImpresoraPosApi['saveTemplate']>,
    submitTestPrint: profileId => invoke('impresora:submitTestPrint', profileId) as ReturnType<ImpresoraPosApi['submitTestPrint']>,
  };
  const exposedKeys = Object.keys(bridge).sort();
  const allowedKeys = [...FUTURE_BRIDGE_ALLOWLIST].sort();
  if (exposedKeys.length !== allowedKeys.length || exposedKeys.some((key, index) => key !== allowedKeys[index])) {
    throw new Error('BRIDGE_ALLOWLIST_MISMATCH');
  }
  return bridge;
}
