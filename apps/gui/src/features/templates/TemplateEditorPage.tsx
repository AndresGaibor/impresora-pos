import { useState } from 'react';
import type { ImpresoraPosApi, PrinterProfile, TemplateDefinition } from '../../app/agent-api';
import { resolveLayout, toPreviewModel } from '@impresora-pos/renderer';
import { fiscalGuardrail, reduceTemplate } from './editor-state';

export function TemplateEditorPage({ api, template, profile }: { api: ImpresoraPosApi; template: TemplateDefinition; profile: PrinterProfile }) {
  const [current, setCurrent] = useState(template);
  const guard = fiscalGuardrail(current);
  const preview = toPreviewModel(resolveLayout(current, {}, profile));
  return <section className="page-stack"><p className="eyebrow">Editor por bloques</p><h1>{current.name}</h1><div className="panel"><p>{current.blocks.length} bloques · {preview.columns} columnas</p>{current.blocks.map((block, index) => <div className="editor-row" key={index}><span>{block.type}</span><button type="button" className="button button-quiet" onClick={() => setCurrent(reduceTemplate(current, { type: 'remove', index }))}>Quitar</button></div>)}<p className={guard.valid ? 'notice' : 'notice notice-warning'}>{guard.valid ? 'Guardrail fiscal listo.' : `Faltan roles: ${guard.missing.join(', ')}`}</p><button type="button" className="button button-primary" disabled={!guard.valid} onClick={() => void api.saveTemplate(current)}>Guardar plantilla</button></div></section>;
}
