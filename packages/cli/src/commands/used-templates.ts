import { createPlaudClient } from '../createPlaudClient.js';

export async function usedTemplatesCommand(args: string[]): Promise<void> {
  const json = args.includes('--json');
  let scope: 'live' | 'trash' | 'all' = 'live';
  if (args.includes('--all')) scope = 'all';
  else if (args.includes('--trash')) scope = 'trash';

  const client = createPlaudClient();
  const res = await client.listUsedTemplates({ scope });

  if (json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Scope: ${scope}  |  files: ${res.files_scanned}  |  details OK: ${res.details_ok}  |  errors: ${res.details_errors.length}\n`,
  );
  for (const t of res.templates) {
    const name = t.template_name || '(no name)';
    // eslint-disable-next-line no-console
    console.log(
      `${t.template_id}  [${t.template_type || '—'}]  ${name}  —  ${t.usage_count} use(s) in ${t.file_count} file(s)`,
    );
  }
  if (res.templates.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No used_template on any content_list item. (Generate summaries in Plaud first.)');
  }
  if (res.details_errors.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\nDetail fetch errors:');
    for (const e of res.details_errors) {
      // eslint-disable-next-line no-console
      console.log(`  ${e.file_id}: ${e.error}`);
    }
  }
}
