import { PlaudConfig } from './config.js';
import type { PlaudOAuth } from './oauth/plaud-oauth.js';
import { BASE_URLS } from './types.js';
import type { PlaudTokenData } from './types.js';

/** Use JWT until shortly before `expiresAt`, then refresh with password (if present) or ask for `import-token` again. */
const TOKEN_USE_MARGIN_MS = 60_000; // 1 min before `exp` (avoids false “expired” on clock skew)

/** Abstraction: password (consumer access-token) or OAuth (same org token as @plaud-ai/mcp, browser = Google/SSO on Plaud page). */
export interface IPlaudAuth {
  getToken(): Promise<string>;
}

/**
 * After `login-oauth` / plaud_oauth_login: reuses the Developer OAuth access token for api.plaud.* (consumer) requests.
 * Sign in to Plaud in the browser (Google SSO is offered on the Plaud login page) — no stored password.
 */
export class PlaudOAuthConsumerAuth implements IPlaudAuth {
  constructor(private readonly oauth: PlaudOAuth) {}

  async getToken(): Promise<string> {
    const t = await this.oauth.getAccessToken();
    if (!t) {
      throw new Error(
        'Not authenticated. Run `npm run login-oauth` (or plaud_oauth_login), then complete login in the browser (Google/plaud.ai).',
      );
    }
    return t;
  }
}

export class PlaudAuth implements IPlaudAuth {
  private config: PlaudConfig;

  constructor(config: PlaudConfig) {
    this.config = config;
  }

  async getToken(): Promise<string> {
    const cached = this.config.getToken();
    const creds = this.config.getCredentials();
    if (cached) {
      if (Date.now() < cached.expiresAt - TOKEN_USE_MARGIN_MS) {
        return cached.accessToken;
      }
      if (creds) {
        return this.login();
      }
      throw new Error(
        'Consumer access token expired. In the browser, copy a new Authorization: Bearer from api.plaud.ai, then: plaud import-token app "…".',
      );
    }
    if (creds) {
      return this.login();
    }
    throw new Error('Not authenticated. Run `plaud login`, `plaud import-token app "…"`, or `npm run login-oauth` (Google SSO).');
  }

  async login(): Promise<string> {
    const creds = this.config.getCredentials();
    if (!creds) {
      throw new Error('No credentials configured. Run `plaud login` first.');
    }

    const baseUrl = BASE_URLS[creds.region] ?? BASE_URLS['us'];
    const body = new URLSearchParams({
      username: creds.email,
      password: creds.password,
    });

    const res = await fetch(`${baseUrl}/auth/access-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json() as {
      status: number;
      msg?: string;
      access_token: string;
      token_type: string;
    };

    if (data.status !== 0 || !data.access_token) {
      throw new Error(data.msg || `Login failed (status ${data.status})`);
    }

    const decoded = this.decodeJwtExpiry(data.access_token);
    const tokenData: PlaudTokenData = {
      accessToken: data.access_token,
      tokenType: data.token_type || 'Bearer',
      issuedAt: decoded.iat * 1000,
      expiresAt: decoded.exp * 1000,
    };

    this.config.saveToken(tokenData);
    return data.access_token;
  }

  private decodeJwtExpiry(jwt: string): { iat: number; exp: number } {
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return { iat: payload.iat ?? 0, exp: payload.exp ?? 0 };
  }
}
