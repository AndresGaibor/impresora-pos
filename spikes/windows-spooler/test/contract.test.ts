import { expect, test } from 'bun:test';
import { listPrinters, sendRaw } from '../src/probe';

test('adapter exposes enumeration and raw send without Electron', async () => {
  expect(typeof listPrinters).toBe('function');
  expect(typeof sendRaw).toBe('function');
});
