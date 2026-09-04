import { useState } from 'react';
import type { ImpresoraPosApi, Diagnostics } from '../../app/agent-api';

export function diagnosticsMessage(code: string): string {
  if (code === 'NETWORK_TIMEOUT') return 'No hubo respuesta de la impresora. Comprueba el host y el puerto configurados.';
  if (code === 'SPOOLER_REJECTED') return 'Windows rechazó el trabajo. Revisa que la impresora y su controlador estén instalados.';
  return 'El agente informó un error técnico. Revisa el estado mostrado y vuelve a intentar.';
}

export function DiagnosticsPage({ api }: { api: ImpresoraPosApi }) {
  const [items, setItems] = useState<Diagnostics>([]); const [message, setMessage] = useState<string | null>(null);
  const run = async () => { try { setItems(await api.exportDiagnostics()); setMessage('Diagnóstico generado sin datos de tickets.'); } catch { setMessage('No se pudo generar el diagnóstico.'); } };
  return <section className="page-stack"><p className="eyebrow">Soporte</p><h1>Diagnóstico</h1><p className="muted">Revisa agente, impresora, transporte y compatibilidad sin exponer datos de clientes.</p><button type="button" className="button button-primary" onClick={() => void run()}>Generar diagnóstico</button>{items.map((item, index) => <article className="panel" key={index}><strong>{String(item['step'] ?? item['code'] ?? 'Resultado')}</strong><p>{typeof item['code'] === 'string' ? diagnosticsMessage(item['code']) : 'Paso completado.'}</p></article>)}{message && <p className="notice" role="status">{message}</p>}</section>;
}
