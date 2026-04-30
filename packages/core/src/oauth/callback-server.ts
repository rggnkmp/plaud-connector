import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';

const LOGIN_TIMEOUT_MS = 120_000;

function normalizePath(p: string): string {
  if (p === '' || p === '/') return '/';
  return p.replace(/\/$/, '') || '/';
}

/**
 * @param callbackPath — path from `redirectUri` (e.g. `/auth/callback`); must match what Plaud redirects to.
 */
export function captureOAuthCallback(
  port: number,
  expectedState: string,
  /** For parsing query string only. */
  host = '127.0.0.1',
  /** Bind all interfaces so both localhost and 127.0.0.1 can reach the socket. */
  listenHost: string = '0.0.0.0',
  callbackPath = '/auth/callback',
): Promise<{ code: string; state: string }> {
  const want = normalizePath(callbackPath);

  return new Promise((resolve, reject) => {
    let server: Server | null = null;
    const done = (fn: () => void) => {
      try {
        server?.closeAllConnections?.();
        server?.close();
      } catch {
        /* empty */
      }
      fn();
    };
    const timeout = setTimeout(() => {
      done(() => reject(new Error('OAuth timed out. Try again and complete sign-in in the browser.')));
    }, LOGIN_TIMEOUT_MS);

    server = createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end();
        return;
      }
      const u = new URL(req.url, `http://${host}:${port}`);
      if (normalizePath(u.pathname) !== want) {
        if (u.pathname === '/favicon.ico') {
          res.writeHead(204);
          res.end();
          return;
        }
        res.writeHead(404);
        res.end();
        return;
      }
      const oauthError = u.searchParams.get('error');
      if (oauthError) {
        const desc = u.searchParams.get('error_description')?.replace(/\+/g, ' ') ?? '';
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(
          `<!DOCTYPE html><h1>Sign-in failed</h1><p>${escapeHtml(oauthError)}</p><p>${escapeHtml(desc)}</p>`,
        );
        clearTimeout(timeout);
        done(() =>
          reject(
            new Error(
              `OAuth callback error: ${oauthError}${desc ? ` — ${desc}` : ''}.` +
                (oauthError === 'invalid_request'
                  ? ' `redirect_uri` in the app must match `PLAUD_OAUTH_REDIRECT_URI` (try http://127.0.0.1:8199/auth/callback). Re-run a fresh plaud login-oauth.'
                  : ' Run a fresh plaud login-oauth.'),
            ),
          ),
        );
        return;
      }
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      if (!code) {
        res.writeHead(400);
        res.end('Missing code');
        clearTimeout(timeout);
        done(() => reject(new Error('Missing authorization code (no ?code= in callback URL). Check Plaud / browser redirect).')));
        return;
      }
      if (state && state !== expectedState) {
        res.writeHead(400);
        res.end('State mismatch');
        clearTimeout(timeout);
        done(() => reject(new Error('OAuth state mismatch (possible CSRF or old tab). Close extra tabs and run plaud login-oauth again.)')));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><h1>Authentication successful</h1><p>You can close this tab.</p>');
      clearTimeout(timeout);
      done(() => resolve({ code, state: state ?? expectedState }));
    });
    server.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      const code = e.code;
      if (code === 'EADDRINUSE') {
        done(() =>
          reject(
            new Error(
              `Port ${port} is already in use. Stop the other process or set PLAUD_OAUTH_REDIRECT_URI to a free port, e.g. http://localhost:8198/auth/callback and match PLAUD in Dev Console if needed.`,
            ),
          ),
        );
        return;
      }
      done(() => reject(e));
    });
    server.listen(port, listenHost, () => undefined);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
