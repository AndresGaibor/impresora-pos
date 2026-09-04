import { useState } from 'react';
import type { ImpresoraPosApi } from '../../app/agent-api';

export function PairingPanel({ api, origin = 'https://erp.example.com', now = () => Date.now() }: { api: ImpresoraPosApi; origin?: string; now?: () => number }) {
  const [code, setCode] = useState<string | null>(null); const [expires, setExpires] = useState(0); const [message, setMessage] = useState<string | null>(null);
  const create = async () => { if (!origin.startsWith('https://')) { setMessage('El ERP debe usar un Origin HTTPS.'); return; } try { const result = await api.createPairingCode(); setCode(result.pairingCode); setExpires(now() + 300000); setMessage(null); } catch { setMessage('No se pudo generar el código.'); } };
  const active = Boolean(code && now() < expires);
  return <section className="panel page-stack"><h2>Vincular ERP</h2><p>Origin aprobado: <code>{origin}</code></p>{!origin.startsWith('https://') && <p className="notice notice-warning">El ERP debe usar un Origin HTTPS.</p>}<button className="button button-primary" type="button" onClick={() => void create()}>{code ? 'Generar nuevo código' : 'Vincular ERP'}</button>{active && <div role="status"><p>Código de un solo uso: <strong>{code}</strong></p><p>Expira en 5 minutos. No compartas credenciales.</p></div>}{code && !active && <p className="notice notice-warning">El código expiró. Genera uno nuevo.</p>}{message && <p className="notice notice-warning" role="alert">{message}</p>}</section>;
}
