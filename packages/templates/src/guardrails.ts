import type { TemplateDefinition, Block } from './schema';

export const SEMANTIC_ROLES = {
  invoice: [
    'issuerRuc',
    'documentNumber',
    'customer',
    'items',
    'totals',
    'accessKey',
    'environment',
  ],
  receipt: [],
} as const;

export type TemplateType = keyof typeof SEMANTIC_ROLES;

export function isBuiltinTemplate(
  template: TemplateDefinition,
): template is TemplateDefinition & { source: 'builtin' } {
  return template.source === 'builtin';
}

export function assertBuiltinImmutable(
  template: TemplateDefinition,
): asserts template is TemplateDefinition & { source: 'builtin' } {
  if (template.source !== 'builtin') {
    throw new Error('Only builtin templates are immutable');
  }
}

export function getSemanticRolesForType(type: TemplateType): readonly string[] {
  return SEMANTIC_ROLES[type] ?? [];
}

export function validateSemanticRole(
  template: TemplateDefinition,
  type: TemplateType,
): { missing: string[]; valid: boolean } {
  const requiredRoles = getSemanticRolesForType(type);
  const fieldPaths = extractFieldPaths(template.blocks);
  const missing: string[] = [];

  for (const role of requiredRoles) {
    const hasRole = fieldPaths.some(
      (p) =>
        p === role ||
        p.startsWith(`${role}.`) ||
        p.startsWith(`${role}[`),
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

function extractFieldPaths(blocks: Block[]): string[] {
  const paths: string[] = [];
  for (const block of blocks) {
    if (block.type === 'field' && 'path' in block) {
      paths.push((block as { path: string }).path);
    }
    if (block.type === 'items-table' && 'columns' in block) {
      for (const col of (block as { columns: { path: string }[] }).columns) {
        paths.push(col.path);
      }
    }
  }
  return paths;
}
