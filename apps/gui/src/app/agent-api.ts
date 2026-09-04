import { z } from 'zod';
import { PrinterDeviceSchema, PrinterProfileSchema } from '@impresora-pos/printer-core/src/types';
import { TemplateDefinitionSchema } from '@impresora-pos/templates';

export const TransportNameSchema = z.enum(['system', 'network']);
export const DeviceSchema = PrinterDeviceSchema;
export const ProfileSchema = PrinterProfileSchema;
export const TemplateSchema = TemplateDefinitionSchema;

export const DashboardSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  agentVersion: z.string(),
  apiVersion: z.string(),
  templateSchemaVersion: z.string(),
  agent: z.enum(['online', 'degraded', 'offline']).optional(),
  profile: z.object({ name: z.string(), paperWidthMm: z.number() }).nullable().optional(),
  lastJob: z.object({ state: z.string(), at: z.string() }).nullable().optional(),
  recentJobs: z.array(z.object({ jobId: z.string(), state: z.string() })).optional(),
  capabilities: z.object({
    supportedTransports: z.array(z.string()),
    supportedLanguages: z.array(z.string()),
    supportedPaperWidths: z.array(z.number()),
  }).optional(),
}).strict();

export const PrinterListSchema = z.array(DeviceSchema);
export const ProfileListSchema = z.array(ProfileSchema);
export const TemplateListSchema = z.array(TemplateSchema);
export const ProbeResultSchema = z.object({
  device: DeviceSchema,
  reachable: z.boolean(),
  firmwareVersion: z.string().optional(),
  serialNumber: z.string().optional(),
}).strict();
export const DiagnosticsSchema = z.array(z.record(z.string(), z.unknown()));
export const PairingCodeSchema = z.object({ pairingCode: z.string().min(1) }).strict();
export const TestPrintSchema = z.object({ jobId: z.string(), state: z.string() }).passthrough();

export type AgentDashboard = z.infer<typeof DashboardSchema>;
export type PrinterDevice = z.infer<typeof DeviceSchema>;
export type PrinterProfile = z.infer<typeof ProfileSchema>;
export type TemplateDefinition = z.infer<typeof TemplateSchema>;
export type ProbeResult = z.infer<typeof ProbeResultSchema>;
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;

export interface ImpresoraPosApi {
  createPairingCode(): Promise<z.infer<typeof PairingCodeSchema>>;
  discoverPrinters(transport?: z.infer<typeof TransportNameSchema>): Promise<PrinterDevice[]>;
  exportDiagnostics(limit?: number): Promise<Diagnostics>;
  getDashboard(): Promise<AgentDashboard>;
  getProfiles(): Promise<PrinterProfile[]>;
  getTemplates(): Promise<TemplateDefinition[]>;
  probePrinter(device: PrinterDevice, transport?: z.infer<typeof TransportNameSchema>): Promise<ProbeResult>;
  saveProfile(profile: PrinterProfile): Promise<PrinterProfile>;
  saveTemplate(template: TemplateDefinition): Promise<TemplateDefinition>;
  submitTestPrint(profileId?: string): Promise<z.infer<typeof TestPrintSchema>>;
}

declare global {
  interface Window { impresoraPos: ImpresoraPosApi; impresoraPosEvents?: { onOpenDiagnostics(listener: () => void): () => void }; }
}
