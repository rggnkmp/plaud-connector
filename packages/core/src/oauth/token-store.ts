import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PlaudTokenSet } from './types.js';

export class PlaudTokenStore {
  private readonly configDir: string;
  private readonly tokenPath: string;

  constructor(filename: string) {
    this.configDir = join(homedir(), '.plaud');
    this.tokenPath = join(this.configDir, filename);
  }

  get path(): string {
    return this.tokenPath;
  }

  async save(tokenSet: PlaudTokenSet): Promise<void> {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 });
    await writeFile(this.tokenPath, JSON.stringify(tokenSet, null, 2), { mode: 0o600 });
  }

  async load(): Promise<PlaudTokenSet | null> {
    try {
      const data = await readFile(this.tokenPath, 'utf-8');
      return JSON.parse(data) as PlaudTokenSet;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    try {
      await rm(this.tokenPath);
    } catch {
      /* empty */
    }
  }
}
