export type ErpState = 'ready' | 'install' | 'pair' | 'permission' | 'incompatible';
export function classifyAgentError(error: { code?: string }): ErpState {
  if (error.code === 'LOCAL_NETWORK_PERMISSION_REQUIRED') return 'permission';
  if (error.code === 'API_INCOMPATIBLE') return 'incompatible';
  if (error.code === 'PAIRING_REQUIRED') return 'pair';
  return 'install';
}

export const invoiceJob = { schemaVersion: 1 as const, jobId: 'erp-demo-0001', type: 'invoice' as const, templateId: 'ecuador-invoice-80-v1', data: { title: 'Factura', invoiceNumber: '001-001-000000001', date: '2026-09-04', customerName: 'Cliente demo', lines: [{ description: 'Producto', quantity: 1, unitPrice: '10.00', total: '10.00' }], subtotal: '10.00', tax: '0.00', total: '10.00', currency: 'USD' } };
