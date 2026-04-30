import * as fs from 'fs';
import { PlaudConfig, PlaudTokenStore, getDefaultMcpOAuthConfig } from '@plaud/core';
import type { PlaudTokenData, PlaudTokenSet } from '@plaud/core';

function decodeJwtPayload(jwt: string): { exp?: number; iat?: number } {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('Value is not a JWT (expected header.payload…).');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as { exp?: number; iat?: number };
  return payload;
}

async function readInput(arg?: string): Promise<string> {
  if (arg) {
    if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
      return fs.readFileSync(arg, 'utf-8').trim();
    }
    return arg.trim();
  }
  if (process.stdin.isTTY) {
    throw new Error('No token. Pass a JWT string, path to a file, or pipe stdin.');
  }
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8').trim();
}

/**
 * `app`  = api.plaud consumer token (from Network: requests to api*.plaud / auth) → ~/.plaud/config.json
 * `dev`  = platform.plaud developer bearer (only if you can copy it) → ~/.plaud/tokens-mcp.json
 */
export async function importTokenCommand(args: string[]): Promise<void> {
  const kind = (args[0] ?? '').toLowerCase();
  if (kind !== 'app' && kind !== 'dev') {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: plaud import-token <app|dev> <jwt | path-to-file | stdin>\n' +
        '  app  — consumer API (plaud_*): paste token from browser DevTools → Network → any api.plaud / api-euc1 request, Authorization: Bearer …\n' +
        '  dev  — developer API (plaud_dev_*): only if you have a platform JWT to paste; otherwise use login-oauth',
    );
    process.exit(1);
  }
  const raw = await readInput(args[1]);
  if (!raw) throw new Error('Empty token input.');

  const payload = decodeJwtPayload(raw);
  const expMs = payload.exp != null ? payload.exp * 1000 : Date.now() + 86400e3;
  const iatMs = payload.iat != null ? payload.iat * 1000 : Date.now();

  if (kind === 'dev') {
    const cfg = getDefaultMcpOAuthConfig();
    const store = new PlaudTokenStore(cfg.tokenFile);
    const set: PlaudTokenSet = {
      access_token: raw,
      token_type: 'Bearer',
      expires_at: expMs,
    };
    await store.save(set);
    // eslint-disable-next-line no-console
    console.log('Developer token saved to:', store.path);
    return;
  }

  const config = new PlaudConfig();
  const token: PlaudTokenData = {
    accessToken: raw,
    tokenType: 'Bearer',
    issuedAt: iatMs,
    expiresAt: expMs,
  };
  config.saveToken(token);
  // eslint-disable-next-line no-console
  console.log('App (consumer) token saved under ~/.plaud/config.json (use plaud list, plaud_*, or OAuth path for dev tools).');
}
