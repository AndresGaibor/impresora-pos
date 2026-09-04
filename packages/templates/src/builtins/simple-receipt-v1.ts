import type { TemplateDefinition } from '../schema';

export const simpleReceipt: TemplateDefinition = {
  id: 'simple-receipt-v1',
  name: 'Simple Receipt',
  source: 'builtin',
  paperWidth: 80,
  blocks: [
    {
      type: 'text',
      content: 'RECEIPT',
    },
    {
      type: 'divider',
    },
    {
      type: 'field',
      path: 'date',
    },
    {
      type: 'space',
      height: 1,
    },
    {
      type: 'items-table',
      columns: [
        { header: 'Item', path: 'items[].name' },
        { header: 'Qty', path: 'items[].quantity' },
        { header: 'Price', path: 'items[].price' },
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
      type: 'cut',
    },
  ],
} as const;
