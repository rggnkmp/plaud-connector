import {
  PlaudDeveloperClient,
  PlaudOAuth,
  getDefaultMcpOAuthConfig,
  openPlaudAuthorizationUrl,
  runPlaudOAuthLogin,
} from '@plaud/core';

export async function loginOauthCommand(_args: string[]): Promise<void> {
  const devCfg = getDefaultMcpOAuthConfig();
  const o = new PlaudOAuth(devCfg);
  const dev = new PlaudDeveloperClient(devCfg);
  // eslint-disable-next-line no-console
  console.log(
    'Starting OAuth (browser will open)…\n' +
      'If /platform/oauth shows "fehlerhafte Daten" with the default client, run:\n' +
      '  PLAUD_MCP_CLIENT_ID=client_37d250cb-50f8-4af1-8cd6-bc6711c5d684 npm run login-oauth\n' +
      'or: npm run import-token app  (then DevTools → Network on web.plaud.ai, copy any Bearer to api*)\n',
  );
  try {
    await runPlaudOAuthLogin(o, {
      openUrl: (u) => openPlaudAuthorizationUrl(u, (line) => console.log(line)),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(String(e));
    // eslint-disable-next-line no-console
    console.log('\nIf the browser did not open, use the Plaud app login URL after starting this command manually.');
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('\nToken saved to:', o.getTokenStorePath());
  try {
    const me = await dev.getCurrentUser();
    // eslint-disable-next-line no-console
    console.log('Signed in as:', JSON.stringify(me, null, 2));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('Token saved; getCurrentUser error:', String(e));
  }
}
