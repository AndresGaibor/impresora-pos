import { useEffect, useState } from 'react';
import type { AgentDashboard, ImpresoraPosApi } from './agent-api';
import { ROUTE_STORAGE_KEY, ROUTES, resolveInitialRoute, type RouteId } from './routes';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { SetupPage } from '../features/setup/SetupPage';
import { PrintersPage } from '../features/printers/PrintersPage';
import { TemplatesPage } from '../features/templates/TemplatesPage';
import { DiagnosticsPage } from '../features/diagnostics/DiagnosticsPage';
import { AboutPage } from '../features/about/AboutPage';

interface ShellProps { api: ImpresoraPosApi; }

export function Shell({ api }: ShellProps) {
  const [dashboard, setDashboard] = useState<AgentDashboard | null>(null);
  const [route, setRoute] = useState<RouteId>('dashboard');
  const [error, setError] = useState(false);

  const loadDashboard = async () => {
    try {
      const result = await api.getDashboard();
      setDashboard(result);
      setError(false);
      const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(ROUTE_STORAGE_KEY);
      setRoute(resolveInitialRoute(result.profile, stored));
    } catch { setError(true); setRoute('setup'); }
  };

  useEffect(() => { void loadDashboard(); return window.impresoraPosEvents?.onOpenDiagnostics(() => setRoute('diagnostics')); }, []);

  const navigate = (next: RouteId) => {
    if (next !== 'setup' && !dashboard?.profile && route !== 'setup') return;
    setRoute(next);
    if (typeof localStorage !== 'undefined') localStorage.setItem(ROUTE_STORAGE_KEY, next);
  };

  const page = error ? <div className="notice notice-danger" role="alert">No se pudo conectar con el agente local. <button className="inline-action" type="button" onClick={() => void loadDashboard()}>Reintentar</button></div>
    : dashboard && route === 'dashboard' ? <DashboardPage dashboard={dashboard} onRefresh={() => void loadDashboard()} />
    : route === 'setup' ? <SetupPage onOpenPrinters={() => navigate('printers')} />
     : route === 'printers' ? <PrintersPage api={api} onSaved={() => void loadDashboard()} />
     : route === 'templates' ? <TemplatesPage api={api} />
     : route === 'diagnostics' ? <DiagnosticsPage api={api} />
     : route === 'about' ? <AboutPage state={{ currentVersion: dashboard?.agentVersion ?? 'unknown', verified: false, busy: false }} onCheck={() => {}} onApply={() => {}} />
    : <section className="page-stack"><p className="eyebrow">Próximamente</p><h1>{ROUTES.find(item => item.id === route)?.label}</h1><p className="muted">Esta sección estará disponible en el siguiente paso de configuración.</p></section>;

  return <div className="app-frame"><aside className="sidebar"><div className="brand"><span className="brand-mark">IP</span><span>Impresora POS</span></div><nav aria-label="Navegación principal">{ROUTES.map(item => <button className={route === item.id ? 'nav-item active' : 'nav-item'} key={item.id} type="button" onClick={() => navigate(item.id)} disabled={item.id !== 'setup' && !dashboard?.profile}>{item.label}</button>)}</nav><div className="sidebar-foot">Local y seguro<br /><span>Sin datos de tickets</span></div></aside><main className="content">{page}</main></div>;
}
