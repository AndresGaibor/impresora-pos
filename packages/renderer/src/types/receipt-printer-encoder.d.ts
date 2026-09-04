declare module '@point-of-sale/receipt-printer-encoder' {
  export default class ReceiptPrinterEncoder {
    constructor(options?: {
      language?: string;
      columns?: number;
      codepageMapping?: string;
      printerModel?: string;
      width?: number;
      imageMode?: string;
      feedBeforeCut?: number;
      newline?: string;
      codepageCandidates?: string[] | null;
      errors?: string;
      debug?: boolean;
      embedded?: boolean;
    createCanvas?: (() => unknown) | null;
  });
    columns: number;
    initialize(): this;
    text(value: string, codepage?: string): this;
    line(value: string): this;
    newline(value?: number): this;
    bold(value?: boolean): this;
    underline(value?: boolean | number): this;
    italic(value?: boolean): this;
    invert(value?: boolean): this;
    size(width: number, height?: number): this;
    align(value: 'left' | 'center' | 'right'): this;
    codepage(value: string): this;
    barcode(value: string, symbology?: string, height?: number): this;
    qrcode(value: string, model?: number, size?: number, errorlevel?: string): this;
    cut(value?: number): this;
    pulse(device?: number, on?: number, off?: number): this;
    raw(data: number[]): this;
    flush(): this;
    encode(format?: string): Uint8Array;
  }
}
