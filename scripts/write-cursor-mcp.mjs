#!/usr/bin/env node
/**
 * Writes .cursor/mcp.json with an absolute path to scripts/mcp-stdio.mjs
 * so Cursor works even when the workspace root is a subfolder (e.g. dist).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const launcher = join(here, 'mcp-stdio.mjs');
const outDir = join(root, '.cursor');
const outFile = join(outDir, 'mcp.json');

const config = {
  mcpServers: {
    'plaud-connector': {
      type: 'stdio',
      command: 'node',
      args: [launcher],
    },
  },
};

try {
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log('Wrote', outFile);
} catch (e) {
  console.warn('[postinstall] Could not write .cursor/mcp.json:', e);
  process.exit(0);
}
console.log('Reload Cursor (or restart) so MCP picks up plaud-connector.');
