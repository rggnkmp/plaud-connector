import { loginCommand } from './commands/login.js';
import { loginOauthCommand } from './commands/login-oauth.js';
import { listCommand } from './commands/list.js';
import { downloadCommand } from './commands/download.js';
import { transcriptCommand } from './commands/transcript.js';
import { syncCommand } from './commands/sync.js';
import { importTokenCommand } from './commands/import-token.js';
import { usedTemplatesCommand } from './commands/used-templates.js';

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  login: loginCommand,
  'login-oauth': loginOauthCommand,
  'oauth': loginOauthCommand,
  list: listCommand,
  download: downloadCommand,
  transcript: transcriptCommand,
  sync: syncCommand,
  'import-token': importTokenCommand,
  'used-templates': usedTemplatesCommand,
};

export async function run(args: string[]): Promise<void> {
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
    return;
  }

  const handler = COMMANDS[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
  }

  try {
    await handler(args.slice(1));
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function printUsage(): void {
  console.log(`Usage: plaud <command> [options]

Commands:
  login                 Email + password for api.plaud (skip if you use Google-only; use login-oauth)
  login-oauth, oauth   Browser OAuth (PKCE) — sign in with Google on the Plaud page; enables all plaud_* + plaud_dev_*
  import-token <app|dev> <jwt>  Save token from browser Network (app=api.plaud consumer; dev=platform) — when OAuth page errors
  list                  List recordings
  used-templates        Aggregate used KI summary templates (from file detail); --all, --trash, --json
  download <id> [dir]   Download audio file
  transcript <id>       Print transcript
  sync <folder>         Download all new recordings to folder`);
}
