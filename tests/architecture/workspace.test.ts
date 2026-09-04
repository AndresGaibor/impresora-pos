import { expect, test } from 'bun:test';
import root from '../../package.json';

test('workspace exposes only approved top-level packages/apps', () => {
  expect(root.workspaces).toEqual(['apps/*', 'packages/*']);
});
