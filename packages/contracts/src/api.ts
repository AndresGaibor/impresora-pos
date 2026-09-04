import { z } from 'zod';
import { API_VERSION, TEMPLATE_SCHEMA_VERSION } from './versions';

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  agentVersion: z.string(),
  apiVersion: z.literal(API_VERSION),
  templateSchemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
}).strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const CapabilitiesResponseSchema = z.object({
  supportedTransports: z.array(z.enum(['system', 'network'])),
  supportedLanguages: z.array(z.enum(['esc-pos'])),
  supportedPaperWidths: z.array(z.number()),
}).strict();

export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponseSchema>;
