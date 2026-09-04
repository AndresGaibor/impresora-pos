import { redact } from './redact';

export const REDACTED = '[REDACTED]';

interface LogEntry {
  timestamp: string;
  event: string;
  metadata: Record<string, unknown>;
}

function serialize(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function createLogEntry(
  event: string,
  metadata: Record<string, unknown>,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    event,
    metadata: redact(metadata),
  };
}

export function createLogger() {
  return {
    info(event: string, metadata: Record<string, unknown>): LogEntry {
      const entry = createLogEntry(event, metadata);
      console.log(serialize(entry));
      return entry;
    },
    error(event: string, metadata: Record<string, unknown>): LogEntry {
      const entry = createLogEntry(event, metadata);
      console.error(serialize(entry));
      return entry;
    },
  };
}
