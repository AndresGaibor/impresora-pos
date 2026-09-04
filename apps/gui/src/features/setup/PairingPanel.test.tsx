import { expect, test } from 'bun:test';
import { PairingPanel } from './PairingPanel';
import { renderToStaticMarkup } from 'react-dom/server';

test('pairing requires explicit action and never renders a code initially', () => {
  const html = renderToStaticMarkup(<PairingPanel api={{ createPairingCode: async () => ({ pairingCode: 'ABC' }) } as never} />);
  expect(html).toContain('Vincular ERP'); expect(html).not.toContain('ABC');
});
test('rejects non-HTTPS ERP origins', () => {
  const html = renderToStaticMarkup(<PairingPanel api={{} as never} origin="http://erp.local" />);
  expect(html).toContain('Origin HTTPS');
});
