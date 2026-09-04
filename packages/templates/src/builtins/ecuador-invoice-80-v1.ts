import type { TemplateDefinition } from '../schema';

export const ecuadorInvoice80: TemplateDefinition = {
  id: 'ecuador-invoice-80-v1',
  name: 'Ecuador Fiscal Invoice (80mm)',
  source: 'builtin',
  paperWidth: 80,
  blocks: [
    {
      type: 'text',
      content: 'FACTURA ELECTRONICA',
    },
    {
      type: 'divider',
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
    },
    {
      type: 'field',
      path: 'customer',
    },
    {
      type: 'field',
      path: 'customer.identifier',
    },
    {
      type: 'field',
      path: 'documentNumber',
    },
    {
      type: 'divider',
    },
    {
      type: 'items-table',
      columns: [
        { header: 'Descripcion', path: 'items[].name' },
        { header: 'Cant', path: 'items[].quantity' },
        { header: 'Precio', path: 'items[].price' },
        { header: 'Total', path: 'items[].total' },
      ],
      showWhenPresent: 'items',
    },
    {
      type: 'divider',
    },
    {
      type: 'totals',
    },
    {
      type: 'divider',
    },
    {
      type: 'field',
      path: 'accessKey',
    },
    {
      type: 'qr',
      value: '{accessKey}',
    },
    {
      type: 'cut',
    },
  ],
} as const;
