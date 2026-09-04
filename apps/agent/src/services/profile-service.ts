import { PrinterProfileSchema, type PrinterProfile } from '@impresora-pos/printer-core/src/types';
import { PrinterProfileRepository } from '../db/repositories/profiles';

export class ProfileService {
  constructor(private readonly repo: PrinterProfileRepository) {}
  save(input: unknown): PrinterProfile {
    const profile = PrinterProfileSchema.parse(input);
    const connection = profile.device.kind === 'network'
      ? { type: 'network', host: profile.device.host, port: profile.device.port }
      : { type: 'system', ...('devicePath' in profile.device && profile.device.devicePath ? { devicePath: profile.device.devicePath } : {}) };
    this.repo.save({
      id: profile.id,
      name: profile.name,
      paperWidthMm: profile.paperWidthMm,
      connection,
      profileData: {
        transport: profile.transport,
        device: profile.device,
        language: profile.language,
        columns: profile.columns,
        codepageMapping: profile.codepageMapping,
        cut: profile.cut,
        drawer: profile.drawer,
        ...(profile.defaultTemplates ? { defaultTemplates: profile.defaultTemplates } : {}),
        ...(profile.hardwareState ? { hardwareState: profile.hardwareState } : {}),
        ...(profile.testMetadata ? { testMetadata: profile.testMetadata } : {}),
      },
    });
    return profile;
  }
  get(id: string): PrinterProfile | null {
    const p = this.repo.find(id);
    if (!p) return null;
    const device = p.connection.type === 'network'
      ? { kind: 'network' as const, host: p.connection.host ?? '', port: p.connection.port ?? 9100 }
      : { kind: 'system' as const, ...('devicePath' in p.connection && p.connection.devicePath ? { devicePath: p.connection.devicePath } : {}) };
    return PrinterProfileSchema.parse({
      id: p.id, name: p.name,
      transport: p.connection.type,
      device,
      language: (p.profileData.language as PrinterProfile['language']) ?? 'esc-pos',
      paperWidthMm: p.paperWidthMm as 58 | 80,
      columns: (p.profileData.columns as number) ?? (p.paperWidthMm === 58 ? 32 : 48),
      codepageMapping: (p.profileData.codepageMapping as PrinterProfile['codepageMapping']) ?? 'epson',
      cut: (p.profileData.cut as boolean) ?? false,
      drawer: (p.profileData.drawer as boolean) ?? false,
      ...(p.profileData.defaultTemplates ? { defaultTemplates: p.profileData.defaultTemplates as PrinterProfile['defaultTemplates'] } : {}),
      ...(p.profileData.hardwareState ? { hardwareState: p.profileData.hardwareState as PrinterProfile['hardwareState'] } : {}),
      ...(p.profileData.testMetadata ? { testMetadata: p.profileData.testMetadata as PrinterProfile['testMetadata'] } : {}),
    });
  }
  delete(id: string): void { this.repo.delete(id); }
  list(): PrinterProfile[] { return this.repo.all().map(p => this.get(p.id)).filter((p): p is PrinterProfile => p !== null); }
}
