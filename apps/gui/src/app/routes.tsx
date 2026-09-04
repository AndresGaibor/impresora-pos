export const ROUTES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'setup', label: 'Configuración' },
  { id: 'printers', label: 'Impresoras' },
  { id: 'templates', label: 'Plantillas' },
  { id: 'diagnostics', label: 'Diagnóstico' },
  { id: 'about', label: 'Acerca de' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];
export const ROUTE_STORAGE_KEY = 'impresora-pos:last-route';

export function resolveInitialRoute(profile: { name?: string; paperWidthMm?: number } | null | undefined, stored: string | null): RouteId {
  const hasUsableProfile = Boolean(profile?.name && (profile.paperWidthMm === 58 || profile.paperWidthMm === 80));
  if (!hasUsableProfile) return 'setup';
  return ROUTES.some(route => route.id === stored) && stored !== 'setup' ? stored as RouteId : 'dashboard';
}
