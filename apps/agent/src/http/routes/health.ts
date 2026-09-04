import { Router } from '../router';
import {
  API_VERSION,
  CapabilitiesResponseSchema,
  HealthResponseSchema,
  TEMPLATE_SCHEMA_VERSION,
} from '@impresora-pos/contracts';
import type { PrinterTransport } from '@impresora-pos/printer-core/src/types';
import type { PrinterProfileRepository } from '../../db/repositories/profiles';
import { ProfileService } from '../../services/profile-service';
import { PrinterProfileSchema } from '@impresora-pos/printer-core/src/types';

export const AGENT_VERSION = '1.0.0';

export interface HealthComposition {
  profiles: PrinterProfileRepository;
  transports: Partial<Record<'system' | 'network', PrinterTransport & { ready?: boolean; capabilities?: { languages?: string[]; paperWidths?: number[] } }>>;
}

export function healthSnapshot(composition: HealthComposition) {
  const rawProfiles = composition.profiles.all();
  if (rawProfiles.length === 0) return HealthResponseSchema.parse({ status: 'degraded' as const, agentVersion: AGENT_VERSION, apiVersion: API_VERSION, templateSchemaVersion: TEMPLATE_SCHEMA_VERSION });
  const profile = validatedProfiles(composition)[0];
  if (!profile) return HealthResponseSchema.parse({ status: 'error' as const, agentVersion: AGENT_VERSION, apiVersion: API_VERSION, templateSchemaVersion: TEMPLATE_SCHEMA_VERSION });
  const transportName = profile.transport;
  const transport = transportName ? composition.transports[transportName] : undefined;
  const status = !profile ? 'degraded' : !transport ? 'error' : transport.ready === false ? 'error' : transport.ready === undefined ? 'degraded' : 'ok';
  return HealthResponseSchema.parse({ status, agentVersion: AGENT_VERSION, apiVersion: API_VERSION, templateSchemaVersion: TEMPLATE_SCHEMA_VERSION });
}

export function capabilitiesSnapshot(composition: HealthComposition) {
  const profiles = validatedProfiles(composition);
  const transports = [...new Set(profiles.map(profile => profile.transport))].filter(name => composition.transports[name]?.ready !== false && composition.transports[name] !== undefined);
  const languages = new Set<string>();
  const paperWidths = new Set<number>();
  for (const profile of profiles) {
    const transport = composition.transports[profile.transport];
    if (!transport || transport.ready === false) continue;
    if (!transport.capabilities?.languages || transport.capabilities.languages.includes(profile.language)) languages.add(profile.language);
    if (!transport.capabilities?.paperWidths || transport.capabilities.paperWidths.includes(profile.paperWidthMm)) paperWidths.add(profile.paperWidthMm);
  }
  return CapabilitiesResponseSchema.parse({ supportedTransports: transports, supportedLanguages: [...languages].filter(value => value === 'esc-pos'), supportedPaperWidths: [...paperWidths].sort((a, b) => a - b) });
}

function validatedProfiles(composition: HealthComposition) {
  return composition.profiles.all().flatMap(stored => {
    try {
      const profile = new ProfileService(composition.profiles).get(stored.id);
      return profile ? [PrinterProfileSchema.parse(profile)] : [];
    } catch {
      return [];
    }
  });
}

export function createHealthRouter(composition: HealthComposition): Router {
  const router = new Router();

  router.add({
    method: 'GET',
    path: '/v1/health',
    auth: false,
    handler: async () => {
       const body = healthSnapshot(composition);
       return new Response(JSON.stringify(HealthResponseSchema.parse(body)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  router.add({
    method: 'GET',
    path: '/v1/capabilities',
    auth: false,
    handler: async () => {
       const body = capabilitiesSnapshot(composition);
       return new Response(JSON.stringify(CapabilitiesResponseSchema.parse(body)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  return router;
}
