import type { AgentDashboard } from '../../app/agent-api';

interface DashboardPageProps {
  dashboard: AgentDashboard;
  onRefresh: () => void;
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Aún no hay envíos registrados';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return `Último envío ${new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
}

export function DashboardPage({ dashboard, onRefresh }: DashboardPageProps) {
  const connected = dashboard.status !== 'error' && dashboard.agent !== 'offline' && (dashboard.agent === 'online' || dashboard.status === 'ok');
  const profile = dashboard.profile;
  return (
    <section className="page-stack" aria-labelledby="dashboard-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Centro de control</p>
          <h1 id="dashboard-title">Estado de impresión</h1>
          <p className="muted">Una vista breve y segura de tu agente local.</p>
        </div>
        <button className="button button-quiet" type="button" onClick={onRefresh}>Actualizar</button>
      </div>
      {dashboard.status === 'degraded' && (
        <div className="notice notice-warning" role="status"><strong>Servicio parcialmente disponible.</strong> Puedes revisar la configuración y volver a intentar la operación.</div>
      )}
      {dashboard.status === 'error' && (
        <div className="notice notice-danger" role="alert"><strong>No se pudo consultar el agente.</strong> Comprueba que el servicio local esté iniciado.</div>
      )}
      <div className="metric-grid">
        <article className="metric-card accent-teal"><span className="metric-label">Agente</span><strong>{connected ? 'Agente conectado' : 'Agente no disponible'}</strong><span className="muted">v{dashboard.agentVersion}</span></article>
        <article className="metric-card"><span className="metric-label">Impresora activa</span><strong>{profile?.name ?? 'Sin configurar'}</strong><span className="muted">{profile ? `${profile.paperWidthMm} mm` : 'Completa la configuración inicial'}</span></article>
        <article className="metric-card"><span className="metric-label">Último envío</span><strong>{dashboard.lastJob?.state ?? 'Sin actividad'}</strong><span className="muted">{formatDate(dashboard.lastJob?.at)}</span></article>
      </div>
      <article className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Historial técnico</p><h2>Actividad reciente</h2></div><span className="muted">{dashboard.recentJobs?.length ?? 0} registros</span></div>
        {dashboard.recentJobs?.length ? <ul className="job-list">{dashboard.recentJobs.map(job => <li key={job.jobId}><span>{job.jobId}</span><strong>{job.state}</strong></li>)}</ul> : <p className="muted">Los envíos aparecerán aquí sin guardar el contenido de los tickets.</p>}
      </article>
      {dashboard.capabilities && <p className="fine-print">Capacidades: {dashboard.capabilities.supportedPaperWidths.join(' / ')} mm · {dashboard.capabilities.supportedTransports.join(', ')}</p>}
    </section>
  );
}
