#!/usr/bin/env npx tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { PlaudRecording } from '@plaud/core';
import {
  PlaudAuth,
  PlaudClient,
  PlaudConfig,
  PlaudDeveloperClient,
  formatPlaudLocalDateTime,
  PlaudOAuth,
  PlaudOAuthConsumerAuth,
  getDefaultMcpOAuthConfig,
  openPlaudAuthorizationUrl,
  runPlaudOAuthLogin,
} from '@plaud/core';

const MAX_B64_BYTES = 4 * 1024 * 1024;

function textJson(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function summarizeRecording(r: PlaudRecording) {
  return {
    id: r.id,
    title: r.filename,
    date: formatPlaudLocalDateTime(r.start_time).replace(' ', 'T'),
    duration_minutes: Math.round(r.duration / 60000),
    has_transcript: r.is_trans,
  };
}

function consumerAuthRequiredError() {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          error: 'auth_required',
          hint:
            'Run: `npm run login-oauth` / plaud_oauth_login; or `npm run import-token` app <jwt> from Network tab; or `npm run login` (password). For plaud_dev_*: tokens in ~/.plaud/tokens-mcp.json via login-oauth or import-token dev.',
        }),
      },
    ],
    isError: true as const,
  };
}

async function main() {
  const config = new PlaudConfig();
  const creds = config.getCredentials();
  const devCfg = getDefaultMcpOAuthConfig();
  const plaudOauth = new PlaudOAuth(devCfg);
  const consumerRegion = (creds?.region ?? (process.env.PLAUD_CONSUMER_REGION as 'us' | 'eu' | undefined)) || 'eu';
  const hasImportedAppToken = !creds && Boolean(config.getToken());
  const client = creds
    ? new PlaudClient(new PlaudAuth(config), creds.region)
    : hasImportedAppToken
      ? new PlaudClient(new PlaudAuth(config), consumerRegion)
      : new PlaudClient(new PlaudOAuthConsumerAuth(plaudOauth), consumerRegion);
  const devClient = new PlaudDeveloperClient(devCfg);

  const hasOauth = Boolean(await plaudOauth.getAccessToken());
  if (creds) {
    // eslint-disable-next-line no-console
    console.error('Plaud: password session in ~/.plaud (consumer + OAuth dev tools as configured).');
  } else if (hasImportedAppToken) {
    // eslint-disable-next-line no-console
    console.error('Plaud: consumer token in ~/.plaud (from plaud import-token app). plaud_dev_* still needs login-oauth or plaud import-token dev.');
  } else if (hasOauth) {
    // eslint-disable-next-line no-console
    console.error(
      'Plaud: OAuth session found — consumer plaud_* and plaud_dev_* use the same token (sign in with Google/Plaud in the browser if you use SSO).',
    );
  } else {
    // eslint-disable-next-line no-console
    console.error(
      'Plaud: no password and no OAuth token. Run `npm run login-oauth` (Google/Plaud in browser) for plaud_* + plaud_dev_*, or `npm run login` if you have a Plaud password.',
    );
  }

  async function assertConsumerSession() {
    if (creds) return null;
    if (config.getToken()) return null;
    if (await plaudOauth.getAccessToken()) return null;
    return consumerAuthRequiredError();
  }

  const server = new McpServer({ name: 'plaud-mcp', version: '1.0.0' });

  server.registerTool('plaud_oauth_login', { description: 'Open browser, OAuth PKCE, save token to ~/.plaud/tokens-mcp.json (Plaud Developer / platform API, same as @plaud-ai/mcp).' }, async () => {
    await runPlaudOAuthLogin(plaudOauth, {
      openUrl: (u) => openPlaudAuthorizationUrl(u, (line) => console.error(line)),
    });
    return textJson({ ok: true, tokenFile: plaudOauth.getTokenStorePath() });
  });

  server.registerTool('plaud_oauth_logout', { description: 'Remove OAuth token file; optionally revokes on server.' }, async () => {
    try {
      await devClient.revokeCurrentUser();
    } catch {
      /* ignore */
    }
    await plaudOauth.logout();
    return textJson({ ok: true, loggedOut: true });
  });

  server.registerTool(
    'plaud_dev_list_files',
    {
      description:
        'Developer / platform API: list files. Optional page, page_size, or filters query + date range (fetches up to 500 rows client-side).',
      inputSchema: z.object({
        page: z.number().optional().default(1),
        page_size: z.number().optional().default(20),
        query: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      }),
    },
    async (p) => {
      if (!(await plaudOauth.getAccessToken())) {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: 'oauth_required', tool: 'plaud_oauth_login' }) },
          ],
          isError: true,
        };
      }
      if (p.query || p.date_from || p.date_to) {
        return textJson(
          await devClient.listFilesWithFilter({
            page: p.page,
            page_size: p.page_size,
            query: p.query,
            date_from: p.date_from,
            date_to: p.date_to,
          }),
        );
      }
      return textJson(await devClient.listFiles(p.page, p.page_size));
    },
  );

  server.registerTool(
    'plaud_dev_get_file',
    { description: 'Developer / platform API: get one file by id.', inputSchema: z.object({ file_id: z.string() }) },
    async (p) => {
      if (!(await plaudOauth.getAccessToken())) return { content: [{ type: 'text' as const, text: '{"error":"oauth_required"}' }], isError: true };
      return textJson(await devClient.getFile(p.file_id));
    },
  );

  server.registerTool(
    'plaud_dev_get_transcript',
    {
      description: 'Developer / platform API: transcript as source_list JSON from getFile (timestamped, speakers).',
      inputSchema: z.object({ file_id: z.string() }),
    },
    async (p) => {
      if (!(await plaudOauth.getAccessToken())) return { content: [{ type: 'text' as const, text: '{"error":"oauth_required"}' }], isError: true };
      const file = (await devClient.getFile(p.file_id)) as { source_list?: unknown };
      return textJson(file.source_list ?? []);
    },
  );

  server.registerTool(
    'plaud_dev_get_notes',
    { description: 'Developer / platform API: AI notes (note_list) for a file.', inputSchema: z.object({ file_id: z.string() }) },
    async (p) => {
      if (!(await plaudOauth.getAccessToken())) return { content: [{ type: 'text' as const, text: '{"error":"oauth_required"}' }], isError: true };
      const file = (await devClient.getFile(p.file_id)) as { note_list?: unknown };
      return textJson(file.note_list ?? []);
    },
  );

  server.registerTool('plaud_dev_get_current_user', { description: 'Developer / platform API: current user.' }, async () => {
    if (!(await plaudOauth.getAccessToken())) return { content: [{ type: 'text' as const, text: '{"error":"oauth_required"}' }], isError: true };
    return textJson(await devClient.getCurrentUser());
  });

  server.registerTool(
    'plaud_list_files',
    {
      description:
        'List Plaud files with optional filter (all|untranscribed|transcribed), min duration, pagination.',
      inputSchema: z.object({
        filter: z.enum(['all', 'untranscribed', 'transcribed']).optional().default('all'),
        min_duration_minutes: z.number().nonnegative().optional(),
        limit: z.number().int().positive().max(500).optional().default(20),
        offset: z.number().int().nonnegative().optional().default(0),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.listFilesWithFilter(p));
    },
  );

  server.registerTool(
    'plaud_search_files',
    {
      description: 'Filter recordings by title substring and/or start/end date (ISO date strings).',
      inputSchema: z.object({
        query: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.searchFiles(p));
    },
  );

  server.registerTool(
    'plaud_get_file',
    {
      description: 'Full /file/detail JSON for one recording (metadata, content_list, pre_download, embeddings, etc.).',
      inputSchema: z.object({ file_id: z.string() }),
    },
    async ({ file_id }) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.getFileDetailData(file_id));
    },
  );

  server.registerTool(
    'plaud_get_metadata',
    {
      description: 'Metadata only for file IDs; merges live + trashed list. Returns { found, missing }.',
      inputSchema: z.object({ file_ids: z.array(z.string()).min(1) }),
    },
    async ({ file_ids }) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.getMetadataForIds(file_ids));
    },
  );

  server.registerTool(
    'plaud_get_transcript',
    {
      description: 'Transcript from S3: raw (transaction) or polished. May be JSON (segments) or text.',
      inputSchema: z.object({
        file_id: z.string(),
        type: z.enum(['raw', 'polished']).optional().default('raw'),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const t = await client.getTranscriptContent(p.file_id, p.type);
      return { content: [{ type: 'text' as const, text: t }] };
    },
  );

  server.registerTool(
    'plaud_get_summary',
    { description: 'AI summary text (auto_sum_note) for a file.', inputSchema: z.object({ file_id: z.string() }) },
    async ({ file_id }) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const t = await client.getSummaryText(file_id);
      return { content: [{ type: 'text' as const, text: t }] };
    },
  );

  server.registerTool(
    'plaud_get_notes',
    { description: 'Note list (note_list) from file detail — AI notes, action items where present.', inputSchema: z.object({ file_id: z.string() }) },
    async ({ file_id }) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const d = await client.getFileDetailData(file_id);
      return textJson(client.getNotesFromDetail(d));
    },
  );

  server.registerTool(
    'plaud_export_transcript',
    {
      description: 'Export transcript as TXT or SRT from segment JSON; optional timestamps and speakers.',
      inputSchema: z.object({
        file_id: z.string(),
        format: z.enum(['txt', 'srt']).optional().default('txt'),
        include_timestamps: z.boolean().optional().default(true),
        include_speakers: z.boolean().optional().default(true),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const out = await client.exportTranscript({
        file_id: p.file_id,
        format: p.format,
        include_timestamps: p.include_timestamps,
        include_speakers: p.include_speakers,
      });
      return { content: [{ type: 'text' as const, text: out }] };
    },
  );

  server.registerTool('plaud_get_user', { description: 'Current Plaud user / account info.' }, async () => {
    const gate = await assertConsumerSession();
    if (gate) return gate;
    return textJson(await client.getUserInfo());
  });

  server.registerTool(
    'plaud_get_temp_audio_url',
    {
      description: 'Temporary signed URL for audio (mp3; set is_opus for alternative).',
      inputSchema: z.object({
        file_id: z.string(),
        is_opus: z.boolean().optional().default(false),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const url = await client.getMp3Url(p.file_id, p.is_opus);
      return textJson({ url, message: url ? 'URL is short-lived.' : 'No URL returned.' });
    },
  );

  server.registerTool(
    'plaud_list_shareable_notes',
    {
      description:
        'List KI notes/summaries that can go into a public share: auto_sum_note, sum_multi_note, consumer_note, with data_id, tab, template_id. Use to pick plaud_create_public_share note_data_ids or template_ids.',
      inputSchema: z.object({ file_id: z.string() }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.listShareableNotesForFile(p.file_id));
    },
  );

  server.registerTool(
    'plaud_create_public_share',
    {
      description:
        'POST /share/public/create (web “Share”). If only file_id: builds object_id + content_config; notes = shareable KI items (see plaud_list_shareable_notes), unless note_data_ids or template_ids narrows. Full body = paste from Network. Optional timezone header (e.g. Europe/Berlin).',
      inputSchema: z.object({
        file_id: z.string().optional().describe('File id = object_id; required unless `body` is a full JSON body'),
        body: z
          .string()
          .optional()
          .describe('Full JSON (object_id, object_type, content_config) copied from Network tab'),
        content_config: z
          .string()
          .optional()
          .describe('JSON object merged on top of built content_config (after note selection)'),
        use_file_detail_notes: z
          .boolean()
          .optional()
          .default(true)
          .describe('If true and only file_id: KI shareable notes (not raw transaction rows); if false, manual content_config / minimal defaults'),
        note_data_ids: z
          .array(z.string())
          .optional()
          .describe('Exact data_id list to place in content_config.notes; use plaud_list_shareable_notes'),
        template_ids: z
          .array(z.string())
          .optional()
          .describe('If set and note_data_ids not, include only notes with this used_template.template_id'),
        timezone: z.string().optional().describe('Sent as timezone header, e.g. Europe/Berlin'),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      if (p.body?.trim()) {
        const full = JSON.parse(p.body) as Record<string, unknown>;
        return textJson(await client.createPublicShare({ body: full, timezone: p.timezone }));
      }
      if (!p.file_id) {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: 'Provide `file_id` or full `body` JSON' }) },
          ],
          isError: true,
        };
      }
      const cfg = p.content_config?.trim() ? (JSON.parse(p.content_config) as Record<string, unknown>) : undefined;
      if (p.use_file_detail_notes !== false) {
        return textJson(
          await client.createPublicShareForFile(p.file_id, {
            timezone: p.timezone,
            content_config: cfg,
            note_data_ids: p.note_data_ids,
            template_ids: p.template_ids,
          }),
        );
      }
      return textJson(
        await client.createPublicShare({ file_id: p.file_id, content_config: cfg, timezone: p.timezone }),
      );
    },
  );

  server.registerTool(
    'plaud_download_audio_base64',
    {
      description: `Download raw audio; returns base64 if size ≤ ${MAX_B64_BYTES} bytes, else an error (use plaud_get_temp_audio_url).`,
      inputSchema: z.object({ file_id: z.string() }),
    },
    async ({ file_id }) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const buf = await client.downloadAudio(file_id);
      if (buf.byteLength > MAX_B64_BYTES) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'file_too_large',
                size_bytes: buf.byteLength,
                max_bytes: MAX_B64_BYTES,
                hint: 'Use plaud_get_temp_audio_url and download out-of-band.',
              }),
            },
          ],
          isError: true,
        };
      }
      const b64 = Buffer.from(buf).toString('base64');
      return textJson({ file_id, size_bytes: buf.byteLength, base64: b64 });
    },
  );

  server.registerTool('plaud_list_folders', { description: 'List folders / tags (filetag).' }, async () => {
    const gate = await assertConsumerSession();
    if (gate) return gate;
    return textJson(await client.listFolders());
  });

  server.registerTool(
    'plaud_list_used_templates',
    {
      description:
        'Scan all recordings (GET /file/detail per file) and list distinct extra.used_template from content_list (auto_sum, consumer/sum_multi notes). Optional scope: live | trash | all.',
      inputSchema: z.object({
        scope: z.enum(['live', 'trash', 'all']).optional().default('live'),
        request_delay_ms: z.number().int().nonnegative().max(2000).optional().default(0),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(
        await client.listUsedTemplates({ scope: p.scope, requestDelayMs: p.request_delay_ms }),
      );
    },
  );

  server.registerTool(
    'plaud_rename_file',
    { description: 'Rename a recording (PATCH /file).', inputSchema: z.object({ file_id: z.string(), new_name: z.string() }) },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.renameFile(p.file_id, p.new_name));
    },
  );

  server.registerTool(
    'plaud_batch_rename',
    {
      description: 'Rename many files (sequential, 500ms gap).',
      inputSchema: z.object({
        renames: z.array(z.object({ file_id: z.string(), new_name: z.string() })).min(1),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.batchRename(p.renames));
    },
  );

  server.registerTool(
    'plaud_move_to_folder',
    { description: 'Set folder/tag for a file (replaces filetag list with one id).', inputSchema: z.object({ file_id: z.string(), folder_id: z.string() }) },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.moveToFolder(p.file_id, p.folder_id));
    },
  );

  server.registerTool(
    'plaud_trash_file',
    { description: 'Move recording to trash.',
      inputSchema: z.object({ file_id: z.string() }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.trashFile(p.file_id));
    },
  );

  server.registerTool(
    'plaud_generate',
    {
      description: 'Start Plaud AI transcript+summary job (POST /ai/transsumm).',
      inputSchema: z.object({
        file_id: z.string(),
        language: z.string().optional(),
        speaker_labeling: z.boolean().optional(),
        llm: z.string().optional(),
        template_id: z.string().optional(),
        template_type: z.string().optional(),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(
        await client.generateTranscriptSummary(p.file_id, {
          language: p.language,
          speaker_labeling: p.speaker_labeling,
          llm: p.llm,
          template_id: p.template_id,
          template_type: p.template_type,
        }),
      );
    },
  );

  server.registerTool(
    'plaud_name_speakers',
    {
      description: 'Rename speaker labels in stored transcript and sync via PATCH + /ai/update_source_info.',
      inputSchema: z.object({
        file_id: z.string(),
        renames: z.array(z.object({ old_name: z.string(), new_name: z.string() })).min(1),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      return textJson(await client.nameSpeakers(p.file_id, p.renames));
    },
  );

  server.registerTool(
    'plaud_upload_transcript_segments',
    {
      description: 'Write transcript as segment array to Plaud (PATCH trans_result) — use after generating or importing segments.',
      inputSchema: z.object({
        file_id: z.string(),
        segments: z
          .string()
          .describe('JSON string: array of segment objects { start_time, end_time, content, speaker, ... }'),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const parsed = JSON.parse(p.segments) as unknown;
      if (!Array.isArray(parsed)) throw new Error('segments must be a JSON array');
      return textJson(await client.uploadTranscriptSegments(p.file_id, parsed));
    },
  );

  /* Legacy / convenience — same as list without filters */
  server.registerTool(
    'plaud_list_recordings',
    { description: 'Compact list of all non-trashed recordings (id, title, date, duration, has_transcript).' },
    async () => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      const recs = await client.listRecordings();
      return textJson(recs.map(summarizeRecording));
    },
  );

  server.registerTool(
    'plaud_query_recordings',
    {
      description: 'In-memory search: title, max_results, only_with_transcript; newest first.',
      inputSchema: z.object({
        title_contains: z.string().optional(),
        max_results: z.number().int().positive().max(500).optional().default(50),
        only_with_transcript: z.boolean().optional(),
      }),
    },
    async (p) => {
      const gate = await assertConsumerSession();
      if (gate) return gate;
      let recs = await client.listRecordings();
      if (p.title_contains?.trim()) {
        const q = p.title_contains.trim().toLowerCase();
        recs = recs.filter(
          (r) => r.filename.toLowerCase().includes(q) || (r.fullname && r.fullname.toLowerCase().includes(q)),
        );
      }
      if (p.only_with_transcript === true) recs = recs.filter((r) => r.is_trans);
      recs.sort((a, b) => b.start_time - a.start_time);
      return textJson(recs.slice(0, p.max_results ?? 50).map(summarizeRecording));
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
