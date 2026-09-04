export const PRINTER_NOT_FOUND = 'PRINTER_NOT_FOUND';
export const NETWORK_TIMEOUT = 'NETWORK_TIMEOUT';
export const SPOOLER_REJECTED = 'SPOOLER_REJECTED';
export const INVALID_TEMPLATE = 'INVALID_TEMPLATE';
export const UNSUPPORTED_CODEPAGE = 'UNSUPPORTED_CODEPAGE';
export const PORT_IN_USE = 'PORT_IN_USE';
export const UNAUTHORIZED_ORIGIN = 'UNAUTHORIZED_ORIGIN';
export const HELPER_NOT_FOUND = 'HELPER_NOT_FOUND';
export const HELPER_INVALID_JSON = 'HELPER_INVALID_JSON';
export const HELPER_ERROR = 'HELPER_ERROR';
export const HELPER_INVALID_DATA = 'HELPER_INVALID_DATA';

export type PrinterErrorCode =
  | typeof PRINTER_NOT_FOUND
  | typeof NETWORK_TIMEOUT
  | typeof SPOOLER_REJECTED
  | typeof INVALID_TEMPLATE
  | typeof UNSUPPORTED_CODEPAGE
  | typeof PORT_IN_USE
  | typeof UNAUTHORIZED_ORIGIN
  | typeof HELPER_NOT_FOUND
  | typeof HELPER_INVALID_JSON
  | typeof HELPER_ERROR
  | typeof HELPER_INVALID_DATA;

export class PrinterError extends Error {
  constructor(
    public readonly code: PrinterErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PrinterError';
  }
}
