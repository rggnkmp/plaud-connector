import { URL } from 'node:url';
import { captureOAuthCallback } from './callback-server.js';
import type { PlaudOAuth } from './plaud-oauth.js';

function parseRedirect(redirectUri: string): { port: number; host: string; callbackPath: string } {
  const u = new URL(redirectUri);
  const port = u.port ? Number.parseInt(u.port, 10) : u.protocol === 'https:' ? 443 : 80;
  return { port, host: u.hostname, callbackPath: u.pathname || '/auth/callback' };
}

/**
 * PKCE: start callback server, then open browser. Default redirect must match the server.
 */
export async function runPlaudOAuthLogin(
  o: PlaudOAuth,
  options: { openUrl: (u: string) => Promise<unknown> | void } = {
    openUrl: (u) => {
      // eslint-disable-next-line no-console
      console.log(`\n${u}\n`);
    },
  },
): Promise<void> {
  const redirectUri = o.getAppConfig().redirectUri;
  const { port, host, callbackPath } = parseRedirect(redirectUri);
  const { url, codeVerifier, state } = o.createAuthorizationRequest();
  const callbackPromise = captureOAuthCallback(port, state, host, '0.0.0.0', callbackPath);
  await Promise.resolve(options.openUrl(url));
  const { code } = await callbackPromise;
  await o.exchangeCode(code, codeVerifier, state);
}
