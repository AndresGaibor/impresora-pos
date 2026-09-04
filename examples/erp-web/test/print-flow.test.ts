import { expect, test } from 'bun:test';
import { classifyAgentError, invoiceJob } from '../src/print-flow';
test('classifies browser integration states', () => { expect(classifyAgentError({ code: 'PAIRING_REQUIRED' })).toBe('pair'); expect(classifyAgentError({ code: 'LOCAL_NETWORK_PERMISSION_REQUIRED' })).toBe('permission'); expect(classifyAgentError({ code: 'API_INCOMPATIBLE' })).toBe('incompatible'); expect(classifyAgentError({ code: 'AGENT_UNAVAILABLE' })).toBe('install'); });
test('example job is declarative and uses stable ERP id', () => { expect(invoiceJob.jobId).toBe('erp-demo-0001'); expect(invoiceJob.templateId).toBe('ecuador-invoice-80-v1'); });
