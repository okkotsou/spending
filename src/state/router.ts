/**
 * Hash routing.
 *
 * The app is a static bundle that has to work from a subdirectory on GitHub
 * Pages, from a Netlify root, and from a home-screen icon with no server to ask
 * about paths. A hash route is the only form that satisfies all three without
 * a redirect rule, and it also gives the URL ingestion path somewhere to live.
 */
import { useEffect, useState } from 'react';

export type RouteName = 'dashboard' | 'transactions' | 'add' | 'budgets' | 'settings';

export interface Route {
  name: RouteName;
  /** Everything after `?` in the hash, already decoded. */
  params: URLSearchParams;
}

const ROUTES: Record<string, RouteName> = {
  '': 'dashboard',
  '/': 'dashboard',
  '/transactions': 'transactions',
  '/add': 'add',
  '/budgets': 'budgets',
  '/settings': 'settings',
};

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [path = '', query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  // `#/ingest` is handled before routing and then replaced, but if it is still
  // in the URL the dashboard is the right place to land.
  return { name: ROUTES[path] ?? 'dashboard', params };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(name: RouteName, params?: Record<string, string>): void {
  const path = name === 'dashboard' ? '/' : `/${name}`;
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  window.location.hash = `#${path}${query}`;
}

export const NAV_ORDER: RouteName[] = ['dashboard', 'transactions', 'add', 'budgets', 'settings'];
