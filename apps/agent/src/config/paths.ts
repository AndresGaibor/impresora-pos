import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface AgentPaths {
  dataDirectory: string;
  database: string;
  logDirectory: string;
  credentialFile: string;
}

export function resolveAgentPaths(dataDirectory?: string, env: NodeJS.ProcessEnv = process.env, osPlatform: NodeJS.Platform = platform()): AgentPaths {
  const root = dataDirectory ?? (osPlatform === 'win32'
    ? join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'ImpresoraPOS')
    : join(env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'impresora-pos'));
  const paths = {
    dataDirectory: root,
    database: join(root, 'db', 'agent.sqlite'),
    logDirectory: join(root, 'logs'),
    credentialFile: join(root, 'credentials', 'admin.token'),
  };
  for (const directory of [paths.dataDirectory, join(root, 'db'), paths.logDirectory, join(root, 'credentials')]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return paths;
}
