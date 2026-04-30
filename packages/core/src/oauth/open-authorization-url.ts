import open from 'open';

/**
 * `open` uses the system default browser; Plaud / Google session cookies live per browser.
 * `PLAUD_OAUTH_OPEN_APP`: e.g. on macOS `google chrome`, `Microsoft Edge`, `Arc` — same app you use for web.plaud.ai.
 * The `log` callback receives a copy-paste of the full URL; use stderr in MCP (stdio) so the transport is not corrupted.
 */
export async function openPlaudAuthorizationUrl(
  url: string,
  log: (line: string) => void,
): Promise<void> {
  const fromEnv = process.env.PLAUD_OAUTH_OPEN_APP?.trim() ?? '';
  log(
    '\nSame browser as web.plaud.ai; if needed set PLAUD_OAUTH_OPEN_APP or paste the URL into the tab where you are already logged in.\n' +
      '"Logged in as --" on the OAuth page = Plaud did not load your profile in that view (see DevTools → Network for a failed user/current call). To proceed without that dialog: on web.plaud.ai take Authorization Bearer from a working api*.plaud request, then: npx plaud import-token app "<paste_jwt>"\n\n' +
      url +
      '\n',
  );
  if (fromEnv) {
    await open(url, { app: { name: fromEnv } });
    return;
  }
  await open(url);
}
