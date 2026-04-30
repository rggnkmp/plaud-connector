import {
  PlaudAuth,
  PlaudClient,
  PlaudConfig,
  PlaudOAuth,
  PlaudOAuthConsumerAuth,
  getDefaultMcpOAuthConfig,
} from '@plaud/core';

/**
 * Password (config.json) or OAuth only (tokens-mcp.json) — same as MCP. Google/SSO: use login-oauth.
 */
export function createPlaudClient(): PlaudClient {
  const config = new PlaudConfig();
  const creds = config.getCredentials();
  const region = (creds?.region ?? (process.env.PLAUD_CONSUMER_REGION as 'us' | 'eu' | undefined)) || 'eu';
  if (creds) {
    return new PlaudClient(new PlaudAuth(config), creds.region);
  }
  if (config.getToken()) {
    return new PlaudClient(new PlaudAuth(config), region);
  }
  const devCfg = getDefaultMcpOAuthConfig();
  const oauth = new PlaudOAuth(devCfg);
  return new PlaudClient(new PlaudOAuthConsumerAuth(oauth), region);
}
