import { expect, test } from 'bun:test';
import rootPackage from '../../package.json';
import guiPackage from '../../apps/gui/package.json';
import { AGENT_VERSION } from '../../apps/agent/src/http/routes/health';

test('root, agent and GUI use one product version', () => {
  expect(rootPackage.version).toBe(AGENT_VERSION);
  expect(guiPackage.version).toBe(AGENT_VERSION);
});
