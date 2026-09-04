import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutPage } from './AboutPage';
test('about page renders current version without update logic in the GUI', () => { const html = renderToStaticMarkup(<AboutPage state={{ currentVersion: '1.0.0', verified: false, busy: false }} onCheck={() => {}} onApply={() => {}} />); expect(html).toContain('1.0.0'); expect(html).toContain('No hay actualizaciones'); });
test('unverified or busy updates cannot be applied', () => { const html = renderToStaticMarkup(<AboutPage state={{ currentVersion: '1.0.0', availableVersion: '1.1.0', verified: false, busy: true }} onCheck={() => {}} onApply={() => {}} />); expect(html).toContain('disabled'); });
