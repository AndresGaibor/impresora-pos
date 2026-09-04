import { z } from 'zod';

export const PAPER_WIDTHS = [58, 80] as const;
export type PaperWidthMm = (typeof PAPER_WIDTHS)[number];

export const PrinterLanguageSchema = z.enum(['esc-pos', 'epson', 'star']);
export type PrinterLanguage = z.infer<typeof PrinterLanguageSchema>;

export const TransportSchema = z.enum(['system', 'network']);
export type Transport = z.infer<typeof TransportSchema>;

export const NetworkDeviceSchema = z.object({
  kind: z.literal('network'),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
});
export type NetworkDevice = z.infer<typeof NetworkDeviceSchema>;

export const SystemDeviceSchema = z.object({
  kind: z.literal('system'),
  devicePath: z.string().optional(),
  deviceName: z.string().optional(),
});
export type SystemDevice = z.infer<typeof SystemDeviceSchema>;

export const PrinterDeviceSchema = z.discriminatedUnion('kind', [
  NetworkDeviceSchema,
  SystemDeviceSchema,
]);
export type PrinterDevice = z.infer<typeof PrinterDeviceSchema>;

export interface ProbeResult {
  device: PrinterDevice;
  reachable: boolean;
  firmwareVersion?: string;
  serialNumber?: string;
}

export interface SendResult {
  success: boolean;
  bytesSent: number;
  spoolerId?: string;
}

export interface PrinterTransport {
  readonly ready?: boolean;
  readonly capabilities?: { languages?: string[]; paperWidths?: number[] };
  discover(): Promise<PrinterDevice[]>;
  probe(device: PrinterDevice): Promise<ProbeResult>;
  print(device: PrinterDevice, bytes: Uint8Array): Promise<SendResult>;
}

export const HardwareStateSchema = z.enum([
  'configured',
  'reachable',
  'spooler-ready',
  'hardware-status-known',
  'hardware-status-unknown',
]);
export type HardwareState = z.infer<typeof HardwareStateSchema>;

export const CodepageMappingSchema = z.enum(['epson', 'standard', 'custom']);
export type CodepageMapping = z.infer<typeof CodepageMappingSchema>;

const PrinterProfileFields = {
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  language: PrinterLanguageSchema,
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  columns: z.number().int().min(1).max(64),
  codepageMapping: CodepageMappingSchema,
  cut: z.boolean().default(false),
  drawer: z.boolean().default(false),
  defaultTemplates: z.record(z.string(), z.string()).optional(),
  hardwareState: HardwareStateSchema.optional(),
  testMetadata: z.record(z.string(), z.unknown()).optional(),
};

export const PrinterProfileSchemaInternal = z.discriminatedUnion('transport', [
  z.object({ ...PrinterProfileFields, transport: z.literal('network'), device: NetworkDeviceSchema }).strict(),
  z.object({ ...PrinterProfileFields, transport: z.literal('system'), device: SystemDeviceSchema }).strict(),
]);
export type PrinterProfile = z.infer<typeof PrinterProfileSchemaInternal>;
export { PrinterProfileSchemaInternal as PrinterProfileSchema };
