export type PlaudOAuthAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** File name under ~/.plaud/ (default: tokens-mcp.json — compatible with @plaud-ai/mcp) */
  tokenFile: string;
  apiBase?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  extraHeaders?: Record<string, string>;
  /** Appended to the auth URL as `&...` (e.g. support-given query). Env: `PLAUD_OAUTH_AUTH_EXTRA`. */
  authorizationQueryExtra?: string;
};

export type PlaudTokenSet = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_at?: number;
};
