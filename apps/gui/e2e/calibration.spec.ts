import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('calibration workflow uses status feedback and profile API', async () => {
  const source = await readFile(new URL('../src/features/printers/CalibrationWizard.tsx', import.meta.url), 'utf8');
  expect(source).toContain('submitTestPrint');
  expect(source).toContain('saveProfile');
  expect(source).toContain('lastTestResult');
  expect(source).toContain('lastTestAt');
  expect(source).toContain('SENT no confirma que salió papel');
  expect(source).not.toMatch(/rawEscPos|Uint8Array|\u001b/);
});
