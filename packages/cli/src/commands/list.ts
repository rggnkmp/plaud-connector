import { formatPlaudLocalDateTime } from '@plaud/core';
import { createPlaudClient } from '../createPlaudClient.js';

export async function listCommand(_args: string[]): Promise<void> {
  const client = createPlaudClient();
  const recordings = await client.listRecordings();

  if (recordings.length === 0) {
    console.log('No recordings found.');
    return;
  }

  for (const rec of recordings) {
    const date = formatPlaudLocalDateTime(rec.start_time);
    const dur = rec.duration ? `${Math.round(rec.duration / 60000)}m` : '?';
    const flags = [rec.is_trans ? 'T' : '', rec.is_summary ? 'S' : ''].filter(Boolean).join('');
    console.log(`${rec.id}  ${date}  ${dur.padStart(4)}  ${flags.padEnd(2)}  ${rec.filename}`);
  }

  console.log(`\n${recordings.length} recording(s)`);
}
