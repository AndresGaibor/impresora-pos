export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status?: string;
}

export interface RawResult {
  accepted: true;
  jobId?: string;
}

export interface RawFailure {
  accepted: false;
  error: string;
}

export type SendRawResult = RawResult | RawFailure;

export function listPrinters(): PrinterInfo[] {
  const { getPrinters, getDefaultPrinterName } = require('@lastapp/node-printer');
  const printers = getPrinters();
  const defaultName = getDefaultPrinterName();
  return printers.map((p: { name: string; isDefault: boolean; status?: string }) => ({
    name: p.name,
    isDefault: p.name === defaultName,
    status: p.status,
  }));
}

export function sendRaw(printerName: string, bytes: Buffer | string): Promise<SendRawResult> {
  const { printDirect } = require('@lastapp/node-printer');
  return new Promise((resolve: (r: SendRawResult) => void) => {
    printDirect({
      data: bytes,
      printer: printerName,
      type: 'RAW',
      docname: 'POS-RAW-JOB',
      success: (jobId: string) => resolve({ accepted: true, jobId }),
      error: (err: Error) => resolve({ accepted: false, error: String(err) }),
    });
  });
}
