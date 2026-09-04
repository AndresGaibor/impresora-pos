import type { TemplateDefinition } from '../schema';

export const printerDiagnosticV1: TemplateDefinition = {
  id: 'printer-diagnostic-v1',
  name: 'Printer diagnostic',
  source: 'builtin',
  paperWidth: 80,
  blocks: [
    { type: 'text', content: 'DIAGNÓSTICO DE IMPRESORA' },
    { type: 'text', content: '48 columnas: 123456789012345678901234567890123456789012345678' },
    { type: 'text', content: '32 columnas: 12345678901234567890123456789012' },
    { type: 'text', content: 'á é í ó ú ñ Ñ' },
    { type: 'text', content: 'NEGRITA: texto de prueba', bold: true },
    { type: 'text', content: 'DOBLE TAMAÑO: texto de prueba', size: 'double' },
    { type: 'barcode', format: 'CODE128', value: 'DIAGNOSTIC-128' },
    { type: 'qr', value: 'printer-diagnostic-v1', size: 6 },
    { type: 'text', content: 'El corte es opcional según el perfil.' },
    { type: 'cut' },
  ],
} as const;
