import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { PlaudTokenStore } from './token-store.js';
import type { PlaudOAuthAppConfig, PlaudTokenSet } from './types.js';

const DEFAULT_AUTHORIZATION_URL = 'https://web.plaud.ai/platform/oauth';
const DEFAULT_TOKEN_URL = 'https://platform.plaud.ai/developer/api/oauth/third-party/access-token';
const DEFAULT_REFRESH_URL = 'https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh';
const EU_TOKEN_URL = 'https://platform-eu.plaud.ai/developer/api/oauth/third-party/access-token';
const EU_REFRESH_URL = 'https://platform-eu.plaud.ai/developer/api/oauth/third-party/access-token/refresh';

/**
 * @plaud-ai/mcp bundle contains both. Newer default in their HTTP server is `37d25…`; the older id still appears in shared code.
 * If `/platform/oauth` shows "fehlerhafte Daten" for one, set `PLAUD_MCP_CLIENT_ID` to the other. No support ticket.
 */
export const DEFAULT_MCP_OAUTH_CLIENT_ID = 'client_9c501dad-8a0d-40b2-a7b0-d1cb8787f674';
export const ALTERNATE_MCP_OAUTH_CLIENT_ID = 'client_37d250cb-50f8-4af1-8cd6-bc6711c5d684';

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function generateOAuthState(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * If token exchange is sent to the wrong Plaud region, Plaud often returns 400 "invalid_request" / "Invalid request. Please try again."
 * Only swap between known default US vs EU third-party token URLs when the user has not set PLAUD_TOKEN_URL.
 */
function alternatePlaudThirdPartyTokenUrl(current: string, cfg: PlaudOAuthAppConfig): string | null {
  if (process.env.PLAUD_TOKEN_URL) {
    return null;
  }
  if (current.includes('platform-eu') && current.includes('oauth/third-party/access-token')) {
    return DEFAULT_TOKEN_URL;
  }
  if (current.includes('platform.plaud.ai') && !current.includes('platform-eu') && current.includes('oauth/third-party/access-token')) {
    return EU_TOKEN_URL;
  }
  return null;
}

export class PlaudOAuth {
  private readonly _config: PlaudOAuthAppConfig;
  private readonly tokenStore: PlaudTokenStore;
  private readonly authorizationUrl: string;
  private tokenUrl: string;
  private refreshUrl: string;

  constructor(config: PlaudOAuthAppConfig) {
    this._config = config;
    this.tokenStore = new PlaudTokenStore(config.tokenFile);
    this.authorizationUrl = config.authorizationUrl ?? DEFAULT_AUTHORIZATION_URL;
    this.tokenUrl = config.tokenUrl ?? DEFAULT_TOKEN_URL;
    this.refreshUrl = config.refreshUrl ?? DEFAULT_REFRESH_URL;
  }

  getAppConfig(): PlaudOAuthAppConfig {
    return this._config;
  }

  getTokenStorePath(): string {
    return this.tokenStore.path;
  }

  createAuthorizationRequest(): { url: string; codeVerifier: string; state: string } {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateOAuthState();
    const params = new URLSearchParams({
      client_id: this._config.clientId,
      redirect_uri: this._config.redirectUri,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    let url = `${this.authorizationUrl}?${params.toString()}`;
    const extra = this._config.authorizationQueryExtra?.trim();
    if (extra) {
      url += (extra.startsWith('&') ? '' : '&') + extra;
    }
    return { url, codeVerifier, state };
  }

  /**
   * Public client (no secret): same as @plaud-ai/mcp — no Basic header, `grant_type` + `client_id` in body.
   * Confidential client: Basic auth + code (legacy / custom apps with PLAUD_MCP_CLIENT_SECRET set).
   */
  async exchangeCode(code: string, codeVerifier: string, state: string): Promise<PlaudTokenSet> {
    const secret = this._config.clientSecret?.trim() ?? '';
    const usePublicClient = secret.length === 0;

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      ...this._config.extraHeaders,
    };
    let body: Record<string, string>;

    if (usePublicClient) {
      body = {
        grant_type: 'authorization_code',
        client_id: this._config.clientId,
        code,
        redirect_uri: this._config.redirectUri,
        code_verifier: codeVerifier,
      };
    } else {
      const basicAuth = Buffer.from(`${this._config.clientId}:${secret}`).toString('base64');
      headers.Authorization = `Basic ${basicAuth}`;
      body = {
        code,
        redirect_uri: this._config.redirectUri,
        code_verifier: codeVerifier,
        state,
      };
    }

    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams(body),
    });
    let effectiveRes = res;
    if (!res.ok) {
      const firstBody = await res.text();
      const tryRegion = res.status === 400 || res.status === 401 || res.status === 403;
      const altUrl = alternatePlaudThirdPartyTokenUrl(this.tokenUrl, this._config);
      if (tryRegion && altUrl) {
        const h2: Record<string, string> = {
          ...headers,
          'x-pld-region': altUrl.includes('platform-eu') ? 'eu' : 'us',
        };
        const res2 = await fetch(altUrl, {
          method: 'POST',
          headers: h2,
          body: new URLSearchParams(body),
        });
        if (res2.ok) {
          this.tokenUrl = altUrl;
          this.refreshUrl = altUrl.includes('platform-eu') ? EU_REFRESH_URL : DEFAULT_REFRESH_URL;
          effectiveRes = res2;
        } else {
          const t2 = await res2.text();
          throw new Error(
            `Token exchange failed. US: ${res.status} ${firstBody.slice(0, 400)}. EU: ${res2.status} ${t2.slice(0, 400)}. Same code must not be used twice. Try PLAUD_OAUTH_REDIRECT_URI, alternate PLAUD_MCP_CLIENT_ID, or PLAUD_USE_EU_MCP=1.`,
          );
        }
      } else {
        let detail = firstBody;
        try {
          const j = JSON.parse(firstBody) as { detail?: unknown; message?: string; error?: string };
          if (j.detail !== undefined) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
          else if (j.message) detail = j.message;
          else if (j.error) detail = j.error;
        } catch {
          /* use firstBody */
        }
        throw new Error(
          `Token exchange failed (${res.status}): ${detail.slice(0, 800)}. ` +
            `"Invalid request" often = wrong redirect vs authorize URL, code reused, or US/EU mismatch (try PLAUD_USE_EU_MCP=1). ` +
            `Or: plaud import-token app with Bearer from web.plaud.ai Network tab.`,
        );
      }
    }
    const data = (await effectiveRes.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
    };
    const tokenSet: PlaudTokenSet = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type ?? 'Bearer',
      expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };
    await this.tokenStore.save(tokenSet);
    return tokenSet;
  }

  async getAccessToken(): Promise<string | null> {
    const tokenSet = await this.tokenStore.load();
    if (!tokenSet) return null;
    if (tokenSet.expires_at && Date.now() > tokenSet.expires_at - 60_000) {
      if (tokenSet.refresh_token) {
        try {
          const refreshed = await this.refresh(tokenSet.refresh_token);
          return refreshed.access_token;
        } catch {
          return null;
        }
      }
      return null;
    }
    return tokenSet.access_token;
  }

  async refresh(refreshToken: string): Promise<PlaudTokenSet> {
    const res = await fetch(this.refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...this._config.extraHeaders,
      },
      body: new URLSearchParams({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
    };
    const tokenSet: PlaudTokenSet = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      token_type: data.token_type ?? 'Bearer',
      expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };
    await this.tokenStore.save(tokenSet);
    return tokenSet;
  }

  async logout(): Promise<void> {
    await this.tokenStore.clear();
  }
}
