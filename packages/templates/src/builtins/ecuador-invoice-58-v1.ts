import type { TemplateDefinition } from '../schema';

export const ecuadorInvoice58: TemplateDefinition = {
  id: 'ecuador-invoice-58-v1',
  name: 'Ecuador Fiscal Invoice (58mm)',
  source: 'builtin',
  paperWidth: 58,
  blocks: [
    {
      type: 'text',
      content: 'FACT. ELECTRONICA',
    },
    {
      type: 'divider',
      char: '-',
    },
    {
      type: 'field',
      path: 'issuerRuc',
    },
    {
      type: 'field',
      path: 'environment',
    },
    {
      type: 'divider',
      char: '-',
    },
    {
      type: 'field',
      path: 'customer',
    },
    {
      type: 'field',
      path: 'documentNumber',
    },
    {
      type: 'items-table',
      columns: [
        { header: 'Art', path: 'items[].name' },
        { header: 'Cant', path: 'items[].quantity' },
        { header: 'Total', path: 'items[].total' },
      ],
      showWhenPresent: 'items',
    },
    {
      type: 'totals',
    },
    {
      type: 'divider',
      char: '-',
    },
    {
      type: 'field',
      path: 'accessKey',
    },
    {
      type: 'qr',
      value: '{accessKey}',
      size: 5,
    },
    {
      type: 'cut',
    },
  ],
} as const;
