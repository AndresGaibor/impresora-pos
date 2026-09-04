import { BUILTIN_TEMPLATES, TemplateDefinitionSchema, validateFiscalTemplate, type TemplateDefinition } from '@impresora-pos/templates';
import { TemplateRepository, type Template } from '../db/repositories/templates';

export class TemplateReadOnlyError extends Error { constructor() { super('TEMPLATE_READ_ONLY'); } }

export class TemplateService {
  constructor(private readonly repo: TemplateRepository) {}

  list(): TemplateDefinition[] { return this.repo.all().map(t => this.definition(t)).filter((t): t is TemplateDefinition => t !== null); }
  get(id: string): TemplateDefinition | null { const t = this.repo.find(id); return t ? this.definition(t) : null; }
  save(input: unknown): TemplateDefinition {
    const definition = TemplateDefinitionSchema.parse(input) as TemplateDefinition;
    const old = this.repo.find(definition.id);
    if (old?.source === 'builtin' || old?.source === 'managed' || definition.source === 'builtin') throw new TemplateReadOnlyError();
    if (definition.name.toLowerCase().includes('invoice') && !validateFiscalTemplate(definition, 'invoice').valid) throw new Error('FISCAL_GUARDRAIL_FAILED');
    const revision = definition.revision ?? ((old?.revision ?? 0) + 1);
    this.repo.save({ id: definition.id, name: definition.name, type: definition.name.toLowerCase().includes('invoice') ? 'invoice' : 'receipt', content: JSON.stringify({ ...definition, revision }), source: 'local', revision });
    return { ...definition, revision };
  }
  delete(id: string): void { const t = this.repo.find(id); if (t && t.source !== 'local') throw new TemplateReadOnlyError(); this.repo.delete(id); }
  duplicate(id: string): TemplateDefinition {
    const source = this.get(id); if (!source) throw new Error('TEMPLATE_NOT_FOUND');
    const copy = { ...source, id: `${source.id}-local-${crypto.randomUUID().slice(0, 8)}`, source: 'local' as const, blocks: source.blocks.map(block => ({ ...block })) };
    const saved = { ...copy, revision: 1 };
    this.repo.save({ id: saved.id, name: saved.name, type: source.name.toLowerCase().includes('invoice') ? 'invoice' : 'receipt', content: JSON.stringify(saved), source: 'local', revision: 1 });
    return saved;
  }
  private definition(template: Template): TemplateDefinition | null {
    try { return TemplateDefinitionSchema.parse(template.source === 'builtin' ? BUILTIN_TEMPLATES[template.id] ?? JSON.parse(template.content) : JSON.parse(template.content)); } catch { return null; }
  }
}
