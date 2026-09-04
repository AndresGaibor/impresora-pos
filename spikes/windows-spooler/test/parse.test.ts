import { expect, test } from 'bun:test';
import { parseArgs } from '../src/parse';

test('parseArgs --list', () => {
  expect(parseArgs(['node', 'probe.ts', '--list'])).toEqual({ command: 'list' });
});

test('parseArgs --send --printer NAME --data VAL', () => {
  expect(parseArgs(['node', 'probe.ts', '--send', '--printer', 'POS-58', '--data', 'HELLO']))
    .toEqual({ command: 'send', printer: 'POS-58', data: 'HELLO' });
});

test('parseArgs probe --printer NAME --data VAL', () => {
  expect(parseArgs(['node', 'probe.ts', 'probe', '--printer', 'ZPL', '--data', 'TEST']))
    .toEqual({ command: 'probe', printer: 'ZPL', data: 'TEST' });
});

test('parseArgs --probe --printer NAME --data VAL', () => {
  expect(parseArgs(['node', 'probe.ts', '--probe', '--printer', 'ZPL', '--data', 'TEST']))
    .toEqual({ command: 'probe', printer: 'ZPL', data: 'TEST' });
});

test('parseArgs --send -p NAME -d VAL (short flags)', () => {
  expect(parseArgs(['node', 'probe.ts', '--send', '-p', 'ZPL', '-d', 'TEST']))
    .toEqual({ command: 'send', printer: 'ZPL', data: 'TEST' });
});

test('parseArgs send RAW -p NAME -d VAL', () => {
  expect(parseArgs(['node', 'probe.ts', 'send', 'RAW', '-p', 'ZPL', '-d', 'TEST']))
    .toEqual({ command: 'probe', printer: 'ZPL', data: 'TEST' });
});

test('parseArgs defaults to list', () => {
  expect(parseArgs(['node', 'probe.ts'])).toEqual({ command: 'list' });
});
