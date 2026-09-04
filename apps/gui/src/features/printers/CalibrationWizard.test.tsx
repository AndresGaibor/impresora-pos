import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalibrationWizard, applyCalibrationObservation, buildTestMetadata, getCodepageMappings, normalizeTestResult, type CalibrationObservation } from './CalibrationWizard';
import type { PrinterProfile } from '../../app/agent-api';

const profile: PrinterProfile = {
  id: 'xp-80c', name: 'XP-80C', transport: 'system', device: { kind: 'system', deviceName: 'XP-80C' },
  language: 'esc-pos', paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: true, drawer: false,
};

test('calibration wizard shows transport status only after a test result exists', () => {
  const initialHtml = renderToStaticMarkup(<CalibrationWizard api={{} as never} profile={profile} />);
  expect(initialHtml).not.toContain('Estado del trabajo:');
  const html = renderToStaticMarkup(<CalibrationWizard api={{} as never} profile={profile} testResult={{ jobId: 'j1', state: 'SENT' }} />);
  expect(html).toContain('Imprimir diagnóstico');
  expect(html).toContain('SENT no confirma que salió papel');
});

test('characters incorrect offers concrete codepage mappings after the observation', () => {
  const html = renderToStaticMarkup(<CalibrationWizard api={{} as never} profile={profile} testResult={{ jobId: 'j1', state: 'SENT' }} />);
  expect(html).toContain('Caracteres incorrectos');
  expect(getCodepageMappings()).toEqual([
    { value: 'epson', label: 'Epson' },
    { value: 'standard', label: 'Estándar' },
    { value: 'custom', label: 'Personalizado' },
  ]);
});

test('only known job states are exposed to the visual feedback loop', () => {
  expect(normalizeTestResult({ jobId: 'a', state: 'SENT' })).toEqual({ jobId: 'a', state: 'SENT' });
  expect(normalizeTestResult({ jobId: 'b', state: 'FAILED' })).toEqual({ jobId: 'b', state: 'FAILED' });
  expect(normalizeTestResult({ jobId: 'c', state: 'unexpected' })).toEqual({ jobId: 'c', state: 'UNKNOWN' });
});

test('a failed test print is persisted as UNKNOWN with a timestamp', () => {
  const metadata = buildTestMetadata('UNKNOWN', '2026-09-04T00:00:00.000Z');
  expect(metadata).toEqual({ lastTestResult: 'UNKNOWN', lastTestAt: '2026-09-04T00:00:00.000Z' });
});

test('cut is disabled only after explicit confirmation', () => {
  const unchanged = applyCalibrationObservation(profile, 'cut-incorrect');
  expect(unchanged.cut).toBe(true);
  const changed = applyCalibrationObservation(profile, 'cut-confirmed');
  expect(changed.cut).toBe(false);
});

test('calibration observations never contain raw printer commands', () => {
  const observations: CalibrationObservation[] = ['characters-incorrect', 'cut-confirmed'];
  expect(observations).not.toContain(expect.stringMatching(/\u001b|raw|command/i));
});
