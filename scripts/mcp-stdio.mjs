#!/usr/bin/env node
/**
 * MCP stdio launcher. Resolves monorepo root from this file's path (<root>/scripts/mcp-stdio.mjs).
 * Do not write to stdout (JSON-RPC only on child process).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';

function markerPath(root) {
  return join(root, 'packages', 'mcp', 'src', 'index.ts');
}

function isMonorepoRoot(d) {
  return existsSync(markerPath(d)) && existsSync(join(d, 'package.json'));
}

function findRoot() {
  if (process.env.PLAUD_MCP_ROOT) {
    const r = resolve(process.env.PLAUD_MCP_ROOT);
    if (isMonorepoRoot(r)) return r;
    console.error('[plaud-mcp] PLAUD_MCP_ROOT is not the Plaud monorepo:', r);
  }
  const scriptFile = fileURLToPath(import.meta.url);
  const fromScript = join(dirname(scriptFile), '..');
  if (isMonorepoRoot(fromScript)) return fromScript;

  let d = resolve(process.cwd());
  for (let i = 0; i < 32; i++) {
    if (isMonorepoRoot(d)) return d;
    const p = dirname(d);
    if (p === d) break;
    d = p;
  }
  return null;
}

const root = findRoot();
if (!root) {
  console.error(
    '[plaud-mcp] Plaud monorepo not found. Set PLAUD_MCP_ROOT, or run: npm run setup-cursor',
  );
  process.exit(1);
}

if (!existsSync(join(root, 'node_modules', 'tsx'))) {
  console.error('[plaud-mcp] Run npm install in', root);
  process.exit(1);
}

const opts = {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '0' },
  windowsHide: true,
};

const child = isWin
  ? spawn('npx.cmd', ['--yes', 'tsx', 'packages/mcp/src/index.ts'], { ...opts, shell: true })
  : spawn('npx', ['--yes', 'tsx', 'packages/mcp/src/index.ts'], { ...opts, shell: false });

child.on('error', (e) => {
  console.error('[plaud-mcp]', e);
  process.exit(1);
});
child.on('exit', (c) => process.exit(c ?? 0));
