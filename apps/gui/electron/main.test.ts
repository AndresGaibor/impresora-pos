import { expect, test } from 'bun:test';
import { hasDiagnosticsArg } from './instance-routing';
test('diagnostics launch flag is explicit', () => { expect(hasDiagnosticsArg(['electron', 'main.js', '--diagnostics'])).toBe(true); expect(hasDiagnosticsArg(['electron', 'main.js'])).toBe(false); });
