import { createPlaudClient } from '../createPlaudClient.js';

function takeSearchFlag(args: string[]): { rest: string[]; search?: string } {
  const rest: string[] = [];
  let search: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--search' || a === '-s') && args[i + 1]) {
      search = args[++i];
      continue;
    }
    rest.push(a);
  }
  return { rest, search };
}

export async function getUsedTemplatesCommand(args: string[]): Promise<void> {
  const json = args.includes('--json');
  let scope: 'live' | 'trash' | 'all' = 'live';
  const filtered = args.filter((a) => a !== '--json');
  if (filtered.includes('--all')) scope = 'all';
  else if (filtered.includes('--trash')) scope = 'trash';

  const { search } = takeSearchFlag(filtered.filter((a) => !['--all', '--trash', '--json'].includes(a)));

  const client = createPlaudClient();
  const res = await client.getUsedTemplates({ scope, search });

  if (json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Scope: ${scope}  |  search: ${res.search ?? '(none)'}  |  files: ${res.files_scanned}  |  details OK: ${res.details_ok}  |  errors: ${res.details_errors.length}\n`,
  );
  const rows = res.search ? res.matched_templates : res.templates;
  for (const t of rows) {
    const name = t.template_name || '(no name)';
    const mark =
      res.resolved_template_id === t.template_id ? '  ← resolved template_id' : '';
    // eslint-disable-next-line no-console
    console.log(
      `${t.template_id}  [${t.template_type || '—'}]  ${name}  —  ${t.usage_count} use(s) in ${t.file_count} file(s)${mark}`,
    );
  }
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      res.search
        ? 'No templates matched the search. Try a shorter substring or --json for full payload.'
        : 'No used_template on any content_list item. (Generate summaries in Plaud first.)',
    );
  }
  if (res.search && res.resolved_template_id) {
    // eslint-disable-next-line no-console
    console.log(`\nResolved template_id for "${res.search}": ${res.resolved_template_id}`);
  } else if (res.search && res.matched_templates.length > 1) {
    // eslint-disable-next-line no-console
    console.log('\nMultiple matches — narrow --search or use --json for template_id fields.');
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
