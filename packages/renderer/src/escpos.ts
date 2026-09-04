/// <reference path="./types/receipt-printer-encoder.d.ts" />
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import type { LayoutModel } from './layout';
import type { PrinterProfile } from '@impresora-pos/printer-core';

export interface EncodeActions {
  cut?: boolean;
  openDrawer?: boolean;
}

export function encoderCodepageMapping(mapping: PrinterProfile['codepageMapping']): string {
  if (mapping === 'standard') return 'pos-5890';
  if (mapping === 'custom') return 'pos-5890';
  return 'epson';
}

export function encodeEscPos(
  layout: LayoutModel,
  profile: PrinterProfile,
  actions?: EncodeActions,
): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({
    language: profile.language,
    // Embedded mode accepts the profile's actual column count.
    columns: profile.columns,
    codepageMapping: encoderCodepageMapping(profile.codepageMapping),
    embedded: true,
  });
  // Embedded encoders cannot initialize themselves; initialize ESC/POS here.
  encoder.raw([0x1b, 0x40]);
  const trailingCommands: number[] = [];

  for (const row of layout.rows) {
    if (row.semanticRole === 'cut') {
      continue;
    }
    if (row.semanticRole === 'barcode') {
      encoder.raw(encodeStandaloneCommand(profile, commandEncoder => {
        commandEncoder.barcode(row.text, undefined, 80);
      }));
      encoder.newline();
      continue;
    }
    if (row.semanticRole === 'qr') {
      encoder.raw(encodeStandaloneCommand(profile, commandEncoder => {
        commandEncoder.qrcode(row.text, 2, 8, 'h');
      }));
      encoder.newline();
      continue;
    }

    for (const cell of row.cells) {
      if (cell.bold) {
        encoder.bold(true);
      }
      if (cell.size === 'double') {
        encoder.size(2, 2);
      }
      encoder.text(cell.text);
      if (cell.size === 'double') {
        encoder.size(1, 1);
      }
      if (cell.bold) {
        encoder.bold(false);
      }
    }
    encoder.newline();
  }

  if (actions?.cut) {
    trailingCommands.push(...encodeStandaloneCommand(profile, commandEncoder => {
      commandEncoder.cut();
    }));
  }

  if (actions?.openDrawer) {
    trailingCommands.push(...encodeStandaloneCommand(profile, commandEncoder => {
      commandEncoder.pulse(0, 200, 500);
    }));
  }

  return concatBytes(encoder.encode(), trailingCommands);
}

function concatBytes(bytes: Uint8Array, trailing: number[]): Uint8Array {
  return Uint8Array.from(Array.from(bytes).concat(trailing));
}

function encodeStandaloneCommand(
  profile: PrinterProfile,
  command: (encoder: ReceiptPrinterEncoder) => void,
): number[] {
  const encoder = new ReceiptPrinterEncoder({
    language: profile.language,
    columns: 48,
    codepageMapping: encoderCodepageMapping(profile.codepageMapping),
  });
  command(encoder);
  return Array.from(encoder.encode());
}
