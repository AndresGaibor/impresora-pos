import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardPage } from './DashboardPage';
import type { AgentDashboard } from '../../app/agent-api';
import { DashboardSchema } from '../../app/agent-api';

const dashboard = {
  status: 'ok', agent: 'online', agentVersion: '1.0.0', apiVersion: '1', templateSchemaVersion: '1',
  profile: { name: 'XP-80C', paperWidthMm: 80 },
  lastJob: { state: 'SENT', at: '2026-09-03T15:30:00.000Z' }, recentJobs: [{ jobId: 'A', state: 'SENT' }],
} satisfies AgentDashboard;

test('renders connected agent, selected printer, paper width and last send', () => {
  const html = renderToStaticMarkup(<DashboardPage dashboard={dashboard} onRefresh={() => undefined} />);
  expect(html).toContain('Agente conectado');
  expect(html).toContain('XP-80C');
  expect(html).toContain('80 mm');
  expect(html).toContain('Último envío');
  expect(html).toContain('3 sept 2026');
});

test('renders setup guidance when no printer profile exists', () => {
  const html = renderToStaticMarkup(<DashboardPage dashboard={{ ...dashboard, profile: null }} onRefresh={() => undefined} />);
  expect(html).toContain('Sin configurar');
  expect(html).toContain('Completa la configuración inicial');
});

test('renders error state with retry and never labels the agent connected', () => {
  const html = renderToStaticMarkup(<DashboardPage dashboard={{ ...dashboard, status: 'error', agent: 'offline' }} onRefresh={() => undefined} />);
  expect(html).toContain('No se pudo consultar el agente');
  expect(html).toContain('Comprueba que el servicio local esté iniciado');
  expect(html).toContain('Actualizar');
  expect(html).not.toContain('Agente conectado');
});

test('renders degraded state as partially available', () => {
  const html = renderToStaticMarkup(<DashboardPage dashboard={{ ...dashboard, status: 'degraded', agent: 'degraded' }} onRefresh={() => undefined} />);
  expect(html).toContain('Servicio parcialmente disponible');
  expect(html).toContain('Actualizar');
});

test('dashboard schema rejects fields outside the aggregate contract', () => {
  expect(() => DashboardSchema.parse({ ...dashboard, secret: 'not-allowed' })).toThrow();
});
