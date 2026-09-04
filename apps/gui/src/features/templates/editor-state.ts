import type { Block, TemplateDefinition } from '@impresora-pos/templates';
import { validateFiscalTemplate } from '@impresora-pos/templates';

export type EditorAction =
  | { type: 'move'; from: number; to: number }
  | { type: 'remove'; index: number }
  | { type: 'update-text'; index: number; patch: { content?: string; bold?: boolean; size?: 'normal' | 'double' } }
  | { type: 'add'; block: Block };

export function reduceTemplate(template: TemplateDefinition, action: EditorAction): TemplateDefinition {
  const blocks = [...template.blocks];
  if (action.type === 'move' && blocks[action.from] && action.to >= 0 && action.to < blocks.length) {
    const [block] = blocks.splice(action.from, 1); blocks.splice(action.to, 0, block!);
  } else if (action.type === 'remove' && action.index >= 0 && action.index < blocks.length) {
    blocks.splice(action.index, 1);
  } else if (action.type === 'add') blocks.push(action.block);
  else if (action.type === 'update-text') {
    const current = blocks[action.index];
    if (current?.type === 'text') blocks[action.index] = { ...current, ...action.patch };
  }
  return { ...template, blocks };
}

export function fiscalGuardrail(template: TemplateDefinition) {
  return validateFiscalTemplate(template, 'invoice');
}
