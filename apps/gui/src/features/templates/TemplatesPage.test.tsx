import { expect, test } from 'bun:test';
import { duplicateAsLocal, TemplatesPage } from './TemplatesPage';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TemplateDefinition } from '../../app/agent-api';

const template: TemplateDefinition = { id: 'invoice', name: 'Factura', source: 'managed', paperWidth: 80, blocks: [{ type: 'text', content: 'Hola' }] };

test('duplicate changes managed template to a local custom copy', () => {
  expect(duplicateAsLocal(template)).toMatchObject({ id: 'invoice-custom', source: 'local', revision: 1 });
});

test('library exposes source and only local editing actions in initial markup', () => {
  const html = renderToStaticMarkup(<TemplatesPage api={{ getTemplates: async () => [], } as never} initialTemplates={[template, { ...template, id: 'builtin', source: 'builtin' }, { ...template, id: 'local', source: 'local' }]} />);
  expect(html).toContain('managed');
  expect(html).toContain('Duplicar para personalizar');
  expect(html).toContain('builtin');
  expect(html).toContain('local');
});
