import { PlaudOAuth, DEFAULT_MCP_OAUTH_CLIENT_ID } from './plaud-oauth.js';
import type { PlaudOAuthAppConfig } from './types.js';

const DEFAULT_API_BASE = 'https://platform.plaud.ai/developer/api';
const EU_DEV_API_BASE = 'https://platform-eu.plaud.ai/developer/api';

export class PlaudDeveloperClient {
  private readonly oauth: PlaudOAuth;
  private readonly apiBase: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(config: PlaudOAuthAppConfig) {
    this.oauth = new PlaudOAuth(config);
    this.apiBase = config.apiBase ?? DEFAULT_API_BASE;
    this.extraHeaders = { ...config.extraHeaders };
  }

  get oauthService(): PlaudOAuth {
    return this.oauth;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await this.oauth.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated. Run plaud_oauth_login or `plaud login oauth`.');
    }
    const res = await this.requestOnce(path, init, this.apiBase, this.extraHeaders, token);
    if (res.ok) {
      return res.json() as Promise<unknown>;
    }
    const firstBody = await res.text();
    if (res.status === 401 || res.status === 403) {
      const alt = this.alternatePlaudRegionBase();
      if (alt) {
        const res2 = await this.requestOnce(path, init, alt.base, { ...this.extraHeaders, ...alt.headerPatch }, token);
        if (res2.ok) {
          return res2.json() as Promise<unknown>;
        }
        const secondBody = await res2.text();
        throw new Error(
          `Plaud developer API: ${res2.status} ${res2.statusText} — ${secondBody.slice(0, 500)} (after US↔EU retry)`,
        );
      }
    }
    throw new Error(`Plaud developer API: ${res.status} ${res.statusText} — ${firstBody.slice(0, 500)}`);
  }

  private async requestOnce(
    path: string,
    init: RequestInit,
    apiBase: string,
    headers: Record<string, string>,
    token: string,
  ): Promise<Response> {
    const url = `${apiBase.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...headers,
        ...init.headers,
      },
    });
  }

  /**
   * Same Plaud account can be on US or EU developer base; 401/403 on one is common with a wrong `x-pld-region` or base. Web UI often shows a generic "Failed to load user information".
   */
  private alternatePlaudRegionBase(): { base: string; headerPatch: Record<string, string> } | null {
    const b = this.apiBase.replace(/\/$/, '');
    if (b.includes('platform-eu') || b === EU_DEV_API_BASE) {
      return { base: DEFAULT_API_BASE, headerPatch: { 'x-pld-region': 'us' } };
    }
    if (b === DEFAULT_API_BASE || (b.includes('platform.plaud.ai') && b.includes('developer') && !b.includes('platform-eu'))) {
      return { base: EU_DEV_API_BASE, headerPatch: { 'x-pld-region': 'eu' } };
    }
    return null;
  }

  async getCurrentUser(): Promise<unknown> {
    return this.request('/open/third-party/users/current');
  }

  async revokeCurrentUser(): Promise<void> {
    await this.request('/open/third-party/users/current/revoke', { method: 'POST' });
  }

  async listFiles(page = 1, pageSize = 20): Promise<unknown> {
    return this.request(`/open/third-party/files/?page=${page}&page_size=${pageSize}`);
  }

  async getFile(fileId: string): Promise<unknown> {
    return this.request(`/open/third-party/files/${fileId}`);
  }

  /** List + client-side filter (same strategy as @plaud-ai/mcp; paginates up to 5×100). */
  async listFilesWithFilter(args: {
    page?: number;
    page_size?: number;
    query?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<unknown> {
    const maxPages = 5;
    const pageSize = 100;
    const hasFilter = Boolean(args.query || args.date_from || args.date_to);
    if (!hasFilter) {
      return this.listFiles(args.page ?? 1, args.page_size ?? 20);
    }
    const parseDate = (s: string) => {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    };
    const q = args.query?.toLowerCase();
    const from = args.date_from ? parseDate(args.date_from) : null;
    const toRaw = args.date_to ? parseDate(args.date_to) : null;
    const to = toRaw !== null ? toRaw + 24 * 60 * 60 * 1000 - 1 : null;
    const matches: unknown[] = [];
    let scanned = 0;
    let truncated = false;
    for (let p = 1; p <= maxPages; p++) {
      const pageResult = (await this.listFiles(p, pageSize)) as { data?: { name?: string; created_at?: string; [k: string]: unknown }[] };
      const items = pageResult.data ?? (pageResult as { [k: string]: unknown }).items ?? [];
      const arr = Array.isArray(items) ? items : [];
      scanned += arr.length;
      for (const item of arr) {
        const name = (item as { name?: string }).name ?? '';
        if (q && !name.toLowerCase().includes(q)) continue;
        if (from !== null || to !== null) {
          const created = parseDate(String((item as { created_at?: string }).created_at ?? ''));
          if (created === null) continue;
          if (from !== null && created < from) continue;
          if (to !== null && created > to) continue;
        }
        matches.push(item);
      }
      if (arr.length < pageSize) break;
      if (p === maxPages) truncated = true;
    }
    return {
      data: matches,
      scanned,
      matched: matches.length,
      truncated,
      note: truncated
        ? `Scanned at most ${maxPages * pageSize} files; narrow filters.`
        : undefined,
    };
  }
}

export function getDefaultMcpOAuthConfig(overrides: Partial<PlaudOAuthAppConfig> = {}): PlaudOAuthAppConfig {
  const useEuMcp = process.env.PLAUD_USE_EU_MCP === '1';
  const baseHeaders: Record<string, string> = {};
  if (process.env.PLAUD_ENV) baseHeaders['x-pld-env'] = process.env.PLAUD_ENV;
  if (process.env.PLAUD_REGION) baseHeaders['x-pld-region'] = process.env.PLAUD_REGION;
  else if (useEuMcp) baseHeaders['x-pld-region'] = 'eu';

  return {
    clientId: process.env.PLAUD_MCP_CLIENT_ID ?? process.env.PLAUD_CLIENT_ID ?? DEFAULT_MCP_OAUTH_CLIENT_ID,
    clientSecret: process.env.PLAUD_MCP_CLIENT_SECRET ?? process.env.PLAUD_CLIENT_SECRET ?? '',
    redirectUri: process.env.PLAUD_OAUTH_REDIRECT_URI ?? 'http://localhost:8199/auth/callback',
    tokenFile: 'tokens-mcp.json',
    apiBase: useEuMcp ? (process.env.PLAUD_API_BASE ?? EU_DEV_API_BASE) : process.env.PLAUD_API_BASE,
    authorizationUrl: process.env.PLAUD_AUTH_URL,
    tokenUrl: useEuMcp
      ? (process.env.PLAUD_TOKEN_URL ?? `${EU_DEV_API_BASE}/oauth/third-party/access-token`)
      : process.env.PLAUD_TOKEN_URL,
    refreshUrl: useEuMcp
      ? (process.env.PLAUD_REFRESH_URL ?? `${EU_DEV_API_BASE}/oauth/third-party/access-token/refresh`)
      : process.env.PLAUD_REFRESH_URL,
    extraHeaders: { ...baseHeaders, ...overrides.extraHeaders },
    authorizationQueryExtra: process.env.PLAUD_OAUTH_AUTH_EXTRA,
    ...overrides,
  };
}
