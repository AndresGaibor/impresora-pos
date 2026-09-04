import { z } from 'zod';
import { PRINT_JOB_SCHEMA_VERSION } from './versions';

export const InvoicePrintDataSchema = z.object({
  title: z.string(),
  invoiceNumber: z.string(),
  date: z.string(),
  customerName: z.string(),
  customerTaxId: z.string().optional(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.string(),
    total: z.string(),
  })),
  subtotal: z.string(),
  tax: z.string(),
  total: z.string(),
  paymentMethod: z.string().optional(),
  currency: z.string().default('USD'),
}).strict();

export const ReceiptPrintDataSchema = z.object({
  title: z.string(),
  lines: z.array(z.object({
    description: z.string(),
    amount: z.string(),
  }).strict()),
  total: z.string().optional(),
  currency: z.string().default('USD'),
}).strict();

export const CashClosePrintDataSchema = z.object({
  title: z.string(),
  openAmount: z.string(),
  salesTotal: z.string(),
  cashTotal: z.string(),
  cardTotal: z.string(),
  closeAmount: z.string(),
  currency: z.string().default('USD'),
}).strict();

export const TestPrintDataSchema = z.object({
  title: z.string(),
  lines: z.array(z.object({
    text: z.string(),
  }).strict()),
}).strict();

export type InvoicePrintData = z.infer<typeof InvoicePrintDataSchema>;
export type ReceiptPrintData = z.infer<typeof ReceiptPrintDataSchema>;
export type CashClosePrintData = z.infer<typeof CashClosePrintDataSchema>;
export type TestPrintData = z.infer<typeof TestPrintDataSchema>;

const PrintJobEnvelopeSchema = z.object({
  schemaVersion: z.literal(PRINT_JOB_SCHEMA_VERSION),
  jobId: z.string().min(1).max(128),
  templateId: z.string().min(1).max(128).optional(),
  printerProfileId: z.string().min(1).max(128).optional(),
  actions: z.object({
    cut: z.boolean().optional(),
    openDrawer: z.boolean().optional(),
  }).strict().optional(),
  reprintOf: z.string().min(1).max(128).optional(),
}).strict();

const InvoiceJobSchema = PrintJobEnvelopeSchema.extend({
  type: z.literal('invoice'),
  data: InvoicePrintDataSchema,
}).strict();

const ReceiptJobSchema = PrintJobEnvelopeSchema.extend({
  type: z.literal('receipt'),
  data: ReceiptPrintDataSchema,
}).strict();

const CashCloseJobSchema = PrintJobEnvelopeSchema.extend({
  type: z.literal('cash-close'),
  data: CashClosePrintDataSchema,
}).strict();

const TestJobSchema = PrintJobEnvelopeSchema.extend({
  type: z.literal('test'),
  data: TestPrintDataSchema,
}).strict();

export const PrintJobSchema = z.discriminatedUnion('type', [
  InvoiceJobSchema,
  ReceiptJobSchema,
  CashCloseJobSchema,
  TestJobSchema,
]);

export type PrintJob = z.infer<typeof PrintJobSchema>;
