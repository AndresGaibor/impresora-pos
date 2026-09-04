export interface AgentRuntimeConfig {
  hostname: '127.0.0.1';
  port: number;
  allowEphemeralPort?: boolean;
  approvedOrigins: string[];
  jobMetadataRetentionDays: number;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<AgentRuntimeConfig> = {}): AgentRuntimeConfig {
  const port = overrides.port ?? (env.PORT ? Number(env.PORT) : 18181);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (port === 0 && !overrides.allowEphemeralPort)) throw new Error('Invalid PORT');
  return {
    hostname: '127.0.0.1',
    port,
    ...(overrides.allowEphemeralPort ? { allowEphemeralPort: true } : {}),
    approvedOrigins: overrides.approvedOrigins ?? (env.APPROVED_ORIGINS ? env.APPROVED_ORIGINS.split(',').filter(Boolean) : []),
    jobMetadataRetentionDays: overrides.jobMetadataRetentionDays ?? Number(env.JOB_METADATA_RETENTION_DAYS ?? 30),
  };
}
