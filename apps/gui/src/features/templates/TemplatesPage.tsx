import { useEffect, useState } from 'react';
import type { ImpresoraPosApi, TemplateDefinition } from '../../app/agent-api';

export function duplicateAsLocal(template: TemplateDefinition): TemplateDefinition {
  return { ...template, id: `${template.id}-custom`, name: `${template.name} (personalizada)`, source: 'local', revision: 1, blocks: [...template.blocks] };
}

export function TemplatesPage({ api, initialTemplates = [] }: { api: ImpresoraPosApi; initialTemplates?: TemplateDefinition[] }) {
  const [templates, setTemplates] = useState<TemplateDefinition[]>(initialTemplates);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void api.getTemplates().then(setTemplates).catch(() => setMessage('No se pudieron cargar las plantillas.')); }, [api]);
  const duplicate = async (template: TemplateDefinition) => {
    try { const saved = await api.saveTemplate(duplicateAsLocal(template)); setTemplates(current => [...current, saved]); setMessage('Plantilla duplicada para personalizar.'); }
    catch { setMessage('No se pudo duplicar la plantilla.'); }
  };
  return <section className="page-stack" aria-labelledby="templates-title"><div className="page-heading"><div><p className="eyebrow">Biblioteca</p><h1 id="templates-title">Plantillas</h1><p className="muted">Usa una base fiscal y personaliza sólo copias locales.</p></div></div><div className="card-grid">{templates.map(template => <article className="panel" key={template.id}><p className="eyebrow">{template.source}</p><h2>{template.name}</h2><p className="muted">{template.paperWidth} mm · {template.blocks.length} bloques</p>{template.source === 'builtin' && <p className="muted">Incluida por el sistema. No editable.</p>}{template.source === 'managed' && <button className="button button-quiet" type="button" onClick={() => void duplicate(template)}>Duplicar para personalizar</button>}{template.source === 'local' && <div><button className="button button-quiet" type="button">Editar</button> <button className="button button-quiet" type="button">Exportar</button></div>}</article>)}</div>{message && <p className="notice" role="status">{message}</p>}</section>;
}
