import { z } from 'zod';
import { ecuadorInvoice80 } from './builtins/ecuador-invoice-80-v1';
import { ecuadorInvoice58 } from './builtins/ecuador-invoice-58-v1';
import { simpleReceipt } from './builtins/simple-receipt-v1';
import { printerDiagnosticV1 } from './builtins/printer-diagnostic-v1';

export { printerDiagnosticV1 } from './builtins/printer-diagnostic-v1';

export const TemplateSourceSchema = z.enum(['builtin', 'managed', 'local']);
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;

export const PAPER_WIDTHS = [58, 80] as const;
export type PaperWidth = (typeof PAPER_WIDTHS)[number];

export const KnownDataPathsSchema = z.enum([
  'issuerRuc',
  'documentNumber',
  'customer',
  'customer.name',
  'customer.identifier',
  'items',
  'items[].name',
  'items[].quantity',
  'items[].price',
  'items[].total',
  'totals',
  'totals.subtotal',
  'totals.tax',
  'totals.total',
  'accessKey',
  'environment',
  'environment.production',
  'environment.test',
  'documentType',
  'date',
  'time',
]);

export type KnownDataPath = z.infer<typeof KnownDataPathsSchema>;

const BlockBaseSchema = z.object({
  type: z.string(),
});

const HtmlPattern = /<[^>]*>/i;
const DangerousPattern = /(?:^|[^a-zA-Z])(?:eval|Function|setTimeout|setInterval|exec|command|subprocess|require|import)\s*\(/i;

const textBlockContentGuard = <T extends z.ZodTypeAny>(schema: T): T => {
  return schema.superRefine((val, ctx) => {
    if (val && typeof val === 'object' && 'content' in val) {
      const content = (val as { content?: string }).content;
      if (content && typeof content === 'string') {
        if (HtmlPattern.test(content)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'HTML content is not allowed',
          });
        }
        if (DangerousPattern.test(content)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Potentially executable content not allowed in text blocks',
          });
        }
      }
    }
    if (val && typeof val === 'object' && 'showWhenPresent' in val) {
      const showWhenPresent = (val as { showWhenPresent?: string }).showWhenPresent;
      if (showWhenPresent && typeof showWhenPresent === 'string') {
        if (DangerousPattern.test(showWhenPresent) || HtmlPattern.test(showWhenPresent)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Expression syntax not allowed in showWhenPresent',
          });
        }
      }
    }
  }) as T;
};

const SafeTextBlockSchema = textBlockContentGuard(
  z.object({
    type: z.literal('text'),
    content: z.string().max(500),
    bold: z.boolean().optional(),
    size: z.enum(['normal', 'double']).optional(),
    showWhenPresent: KnownDataPathsSchema.optional(),
  }).strict(),
);

const FieldBlockSchema = z.object({
  type: z.literal('field'),
  path: z.string(),
  showWhenPresent: KnownDataPathsSchema.optional(),
}).strict();

const ImageBlockSchema = z.object({
  type: z.literal('image'),
  src: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
}).strict();

const DividerBlockSchema = z.object({
  type: z.literal('divider'),
  char: z.string().max(1).optional(),
}).strict();

const SpaceBlockSchema = z.object({
  type: z.literal('space'),
  height: z.number().int().min(1).max(20).optional(),
}).strict();

const ItemsTableColumnSchema = z.object({
  header: z.string(),
  path: z.string(),
}).strict();

const ItemsTableBlockSchema = z.object({
  type: z.literal('items-table'),
  columns: z.array(ItemsTableColumnSchema).min(1),
  showWhenPresent: z.enum(['items']).optional(),
}).strict();

const TotalsBlockSchema = z.object({
  type: z.literal('totals'),
  showWhenPresent: KnownDataPathsSchema.optional(),
}).strict();

const BarcodeBlockSchema = z.object({
  type: z.literal('barcode'),
  format: z.enum(['CODE39', 'CODE128', 'EAN13']).optional(),
  value: z.string(),
}).strict();

const QrBlockSchema = z.object({
  type: z.literal('qr'),
  value: z.string(),
  size: z.number().int().min(1).max(20).optional(),
}).strict();

const CutBlockSchema = z.object({
  type: z.literal('cut'),
}).strict();

export const BlockSchema = z.discriminatedUnion('type', [
  SafeTextBlockSchema,
  FieldBlockSchema,
  ImageBlockSchema,
  DividerBlockSchema,
  SpaceBlockSchema,
  ItemsTableBlockSchema,
  TotalsBlockSchema,
  BarcodeBlockSchema,
  QrBlockSchema,
  CutBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;

export const TemplateDefinitionSchemaInternal = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  source: TemplateSourceSchema,
  revision: z.number().int().min(1).optional(),
  paperWidth: z.union([z.literal(58), z.literal(80)]),
  blocks: z.array(BlockSchema),
}).strict();

export type TemplateDefinitionInternal = z.infer<typeof TemplateDefinitionSchemaInternal>;

export { TemplateDefinitionSchemaInternal as TemplateDefinitionSchema };
export type TemplateDefinition = TemplateDefinitionInternal;

export interface FiscalValidationResult {
  valid: boolean;
  missing: string[];
}

const INVOICE_MANDATORY_ROLES = [
  'issuerRuc',
  'documentNumber',
  'customer',
  'items',
  'totals',
  'accessKey',
  'environment',
] as const;

type InvoiceRole = (typeof INVOICE_MANDATORY_ROLES)[number];

function extractFieldPaths(blocks: Block[]): string[] {
  const paths: string[] = [];
  for (const block of blocks) {
    if (block.type === 'field' && 'path' in block) {
      paths.push(block.path);
    }
    if (block.type === 'items-table' && 'columns' in block) {
      for (const col of block.columns) {
        paths.push(col.path);
      }
    }
    if (block.type === 'totals') {
      paths.push('totals');
    }
  }
  return paths;
}

export function validateFiscalTemplate(
  template: TemplateDefinition,
  type: 'invoice',
): FiscalValidationResult {
  if (type !== 'invoice') {
    return { valid: true, missing: [] };
  }

  const fieldPaths = extractFieldPaths(template.blocks);
  const missing: string[] = [];

  for (const role of INVOICE_MANDATORY_ROLES) {
    const hasRole = fieldPaths.some(
      (p) => p === role || p.startsWith(`${role}.`) || p.startsWith(`${role}[`),
    );
    if (!hasRole) {
      missing.push(role);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

const builtinTemplatesRaw: Record<string, TemplateDefinition> = {
  'ecuador-invoice-80-v1': { ...ecuadorInvoice80, blocks: [...ecuadorInvoice80.blocks] },
  'ecuador-invoice-58-v1': { ...ecuadorInvoice58, blocks: [...ecuadorInvoice58.blocks] },
  'simple-receipt-v1': { ...simpleReceipt, blocks: [...simpleReceipt.blocks] },
  'printer-diagnostic-v1': { ...printerDiagnosticV1, blocks: [...printerDiagnosticV1.blocks] },
};

deepFreeze(builtinTemplatesRaw);
for (const t of Object.values(builtinTemplatesRaw)) {
  deepFreeze(t);
}

export const BUILTIN_TEMPLATES: Readonly<Record<string, TemplateDefinition>> = builtinTemplatesRaw;
