export interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
  auth?: boolean;
}

export interface RouteHandler {
  (req: Request, params: Record<string, string>): Promise<Response>;
}

export class Router {
  private _routes: Route[] = [];

  get routes(): Route[] {
    return this._routes;
  }

  add(route: Route): void {
    this._routes.push(route);
  }

  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this._routes) {
      if (route.method !== method) continue;
      const params = this.matchPath(route.path, pathname);
      if (params !== null) {
        return { route, params };
      }
    }
    return null;
  }

  private matchPath(pattern: string, pathname: string): Record<string, string> | null {
    const patternParts = pattern.split('/');
    const pathnameParts = pathname.split('/');

    if (patternParts.length !== pathnameParts.length) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i++) {
      const p = patternParts[i]!;
      const a = pathnameParts[i]!;
      if (p.startsWith(':')) {
        params[p.slice(1)] = a;
      } else if (p !== a) {
        return null;
      }
    }
    return params;
  }

  handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const match = this.match(req.method, url.pathname);
    if (!match) {
      return Promise.resolve(new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', requestId: crypto.randomUUID() }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    return match.route.handler(req, match.params);
  }
}
