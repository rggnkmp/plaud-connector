import { describe, it, expect } from 'vitest';
import { PlaudConfig, PlaudAuth, PlaudClient } from '../src/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** Run live consumer API: `npm run test:integration` (needs valid `~/.plaud/config.json`). Plain `npm test` skips this file. */
const RUN_LIVE =
  process.env.PLAUD_INTEGRATION === '1' && fs.existsSync(path.join(os.homedir(), '.plaud', 'config.json'));

describe.skipIf(!RUN_LIVE)('integration (live API)', () => {
  const config = new PlaudConfig();
  const creds = config.getCredentials()!;
  const auth = new PlaudAuth(config);
  const client = new PlaudClient(auth, creds?.region ?? 'eu');

  it('gets user info', async () => {
    const user = await client.getUserInfo();
    expect(user.id).toBeTruthy();
    expect(user.nickname).toBeTruthy();
  });

  it('lists recordings', async () => {
    const recs = await client.listRecordings();
    expect(Array.isArray(recs)).toBe(true);
  });

  it('gets recording detail', async () => {
    const recs = await client.listRecordings();
    if (recs.length === 0) return;
    const detail = await client.getRecording(recs[0].id);
    expect(detail.id).toBe(recs[0].id);
  });
});
