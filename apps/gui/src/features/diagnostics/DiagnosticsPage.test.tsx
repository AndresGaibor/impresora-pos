import { expect, test } from 'bun:test';
import { diagnosticsMessage, DiagnosticsPage } from './DiagnosticsPage';
import { renderToStaticMarkup } from 'react-dom/server';

test('maps stable diagnostic errors to actionable safe text', () => {
  expect(diagnosticsMessage('NETWORK_TIMEOUT')).toContain('host y el puerto');
  expect(diagnosticsMessage('SPOOLER_REJECTED')).toContain('controlador');
  expect(diagnosticsMessage('NETWORK_TIMEOUT')).not.toContain('token');
});
test('diagnostics page does not show customer or credential data by default', () => {
  const html = renderToStaticMarkup(<DiagnosticsPage api={{ exportDiagnostics: async () => [] } as never} />);
  expect(html).toContain('Generar diagnóstico'); expect(html).not.toContain('Bearer');
});
