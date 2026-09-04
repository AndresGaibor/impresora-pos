import { expect, test } from 'bun:test';
import { FUTURE_BRIDGE_ALLOWLIST } from './bridge';
test('diagnostics event is separate from the invoke allowlist', () => { expect(FUTURE_BRIDGE_ALLOWLIST).not.toContain('onOpenDiagnostics'); });
