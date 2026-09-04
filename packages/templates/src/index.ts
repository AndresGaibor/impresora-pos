export type {
  TemplateDefinition,
  TemplateSource,
  Block,
  KnownDataPath,
  PaperWidth,
  FiscalValidationResult,
} from './schema';

export {
  TemplateDefinitionSchema,
  TemplateSourceSchema,
  BlockSchema,
  KnownDataPathsSchema,
  validateFiscalTemplate,
  BUILTIN_TEMPLATES,
  PAPER_WIDTHS,
  printerDiagnosticV1,
} from './schema';

export {
  SEMANTIC_ROLES,
  validateSemanticRole,
  isBuiltinTemplate,
  assertBuiltinImmutable,
  getSemanticRolesForType,
  type TemplateType,
} from './guardrails';
