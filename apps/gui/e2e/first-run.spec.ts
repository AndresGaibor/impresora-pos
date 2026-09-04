import { expect, test } from 'bun:test';
import { resolveInitialRoute } from '../src/app/routes';

test('first run always opens guided setup without a usable profile', () => {
  expect(resolveInitialRoute(null, 'dashboard')).toBe('setup');
  expect(resolveInitialRoute(undefined, 'printers')).toBe('setup');
});

test('persisted route is restored only after a usable profile exists', () => {
  expect(resolveInitialRoute({ name: 'XP-80C', paperWidthMm: 80 }, 'diagnostics')).toBe('diagnostics');
  expect(resolveInitialRoute({ name: 'XP-80C', paperWidthMm: 80 }, 'setup')).toBe('dashboard');
});
