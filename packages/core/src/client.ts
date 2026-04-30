import type { IPlaudAuth } from './auth.js';
import { BASE_URLS } from './types.js';
import { formatPlaudLocalDateTime } from './plaud-datetime.js';
import type {
  PlaudGetUsedTemplatesResult,
  PlaudListUsedTemplatesResult,
  PlaudRecording,
  PlaudRecordingDetail,
  PlaudShareableNoteItem,
  PlaudUsedTemplateRow,
  PlaudUsedTemplateSlot,
  PlaudUserInfo,
} from './types.js';

type SpeakerSeg = {
  start_time: number;
  end_time: number;
  content: string;
  speaker: string;
  original_speaker?: string;
  [k: string]: unknown;
};

type FileDetailData = Record<string, unknown> & {
  file_id?: string;
  file_name?: string;
  content_list?: Array<{ data_type?: string; data_link?: string; data_id?: string }>;
  note_list?: unknown[];
  pre_download_content_list?: Array<{ data_content?: string }>;
};

export class PlaudClient {
  private auth: IPlaudAuth;
  private region: string;

  constructor(auth: IPlaudAuth, region: string = 'us') {
    this.auth = auth;
    this.region = region;
  }

  private get baseUrl(): string {
    return BASE_URLS[this.region] ?? BASE_URLS['us'];
  }

  /** Low-level JSON API. GET has no body; POST/PATCH send JSON. */
  async request(
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Record<string, unknown>> {
    const method = init.method ?? 'GET';
    const token = await this.auth.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'edit-from': 'web',
      'app-platform': 'web',
      ...init.headers,
    };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Plaud API error: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    const redirectPayload = data.data as Record<string, unknown> | undefined;
    const domains = redirectPayload?.domains as Record<string, unknown> | undefined;
    const apiDomain = domains?.api;
    if (data.status === -302 && typeof apiDomain === 'string') {
      this.region = apiDomain.includes('euc1') ? 'eu' : 'us';
      return this.request(path, init);
    }

    return data;
  }

  // --- List / search ---

  async listRecordings(): Promise<PlaudRecording[]> {
    const data = await this.request('/file/simple/web');
    const list: PlaudRecording[] = (data.data_file_list as PlaudRecording[]) ?? (data.data as PlaudRecording[]) ?? [];
    return list.filter((r) => !r.is_trash);
  }

  async listFilesRaw(isTrash?: boolean): Promise<PlaudRecording[]> {
    const path = isTrash ? '/file/simple/web?is_trash=1' : '/file/simple/web';
    const data = await this.request(path);
    return ((data.data_file_list as PlaudRecording[]) ?? []) as PlaudRecording[];
  }

  async listFilesWithFilter(args: {
    filter?: 'all' | 'untranscribed' | 'transcribed';
    min_duration_minutes?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    offset: number;
    limit: number;
    files: Array<{
      id: string;
      name: string;
      duration_min: number;
      created_at: string;
      transcribed: boolean;
      has_summary: boolean;
    }>;
  }> {
    const res = await this.request('/file/simple/web');
    let files: PlaudRecording[] = (res.data_file_list as PlaudRecording[]) ?? [];
    if (args.filter === 'transcribed') files = files.filter((f) => f.is_trans);
    else if (args.filter === 'untranscribed') files = files.filter((f) => !f.is_trans);
    if (args.min_duration_minutes) {
      const minMs = args.min_duration_minutes * 60 * 1000;
      files = files.filter((f) => f.duration >= minMs);
    }
    const total = files.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 20;
    const slice = files.slice(offset, offset + limit);
    return {
      total,
      offset,
      limit,
      files: slice.map((f) => ({
        id: f.id,
        name: f.filename,
        duration_min: Math.round(f.duration / 60000),
        created_at: formatPlaudLocalDateTime(f.start_time),
        transcribed: f.is_trans,
        has_summary: f.is_summary,
      })),
    };
  }

  async searchFiles(args: { query?: string; start_date?: string; end_date?: string }): Promise<{
    count: number;
    files: Array<{ id: string; name: string; duration_min: number; created_at: string }>;
  }> {
    const res = await this.request('/file/simple/web');
    let files: PlaudRecording[] = (res.data_file_list as PlaudRecording[]) ?? [];
    if (args.query) {
      const q = args.query.toLowerCase();
      files = files.filter((f) => f.filename.toLowerCase().includes(q));
    }
    if (args.start_date) {
      const start = new Date(args.start_date).getTime();
      files = files.filter((f) => f.start_time >= start);
    }
    if (args.end_date) {
      const end = new Date(args.end_date).getTime();
      files = files.filter((f) => f.start_time <= end);
    }
    return {
      count: files.length,
      files: files.map((f) => ({
        id: f.id,
        name: f.filename,
        duration_min: Math.round(f.duration / 60000),
        created_at: formatPlaudLocalDateTime(f.start_time),
      })),
    };
  }

  async getMetadataForIds(fileIds: string[]): Promise<{ found: PlaudRecording[]; missing: string[] }> {
    const [live, trashed] = await Promise.all([this.listFilesRaw(false), this.listFilesRaw(true)]);
    const byId = new Map<string, PlaudRecording>();
    for (const f of live) byId.set(f.id, f);
    for (const f of trashed) byId.set(f.id, f);
    const found: PlaudRecording[] = [];
    const missing: string[] = [];
    for (const id of fileIds) {
      const f = byId.get(id);
      if (f) found.push(f);
      else missing.push(id);
    }
    return { found, missing };
  }

  // --- Detail (raw) ---

  async getFileDetailData(id: string): Promise<FileDetailData> {
    const data = await this.request(`/file/detail/${id}`);
    const raw = (data.data ?? data) as FileDetailData;
    return raw;
  }

  /**
   * Reads `extra.used_template` from each `content_list` entry in file detail (auto_sum, consumer/sum_multi notes, etc.).
   */
  extractUsedTemplatesFromDetail(
    d: FileDetailData,
    fileId: string,
    fileName: string,
  ): Array<Omit<PlaudUsedTemplateSlot, 'file_id' | 'file_name'>> {
    const cl = d.content_list;
    if (!Array.isArray(cl)) return [];
    const res: Array<Omit<PlaudUsedTemplateSlot, 'file_id' | 'file_name'>> = [];
    for (const item of cl) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const extra = o.extra;
      if (!extra || typeof extra !== 'object') continue;
      const ut = (extra as Record<string, unknown>).used_template as Record<string, unknown> | undefined;
      if (!ut) continue;
      const tid = ut.template_id;
      if (typeof tid !== 'string' || !tid) continue;
      const ttype = typeof ut.template_type === 'string' ? ut.template_type : '';
      const tname = typeof ut.template_name === 'string' ? ut.template_name : null;
      res.push({
        template_id: tid,
        template_type: ttype,
        template_name: tname,
        data_type: typeof o.data_type === 'string' ? o.data_type : '',
      });
    }
    return res;
  }

  private aggregateUsedTemplateSlots(slots: PlaudUsedTemplateSlot[]): PlaudUsedTemplateRow[] {
    type Agg = {
      template_id: string;
      template_type: string;
      template_name: string | null;
      usage_count: number;
      byFile: Map<string, { file_name: string; data_types: string[] }>;
    };
    const byKey = new Map<string, Agg>();
    for (const s of slots) {
      const key = `${s.template_id}\0${s.template_type}`;
      let g = byKey.get(key);
      if (!g) {
        g = {
          template_id: s.template_id,
          template_type: s.template_type,
          template_name: s.template_name,
          usage_count: 0,
          byFile: new Map(),
        };
        byKey.set(key, g);
      }
      g.usage_count++;
      if (s.template_name) {
        if (!g.template_name) g.template_name = s.template_name;
        else if (s.template_name.length > g.template_name.length) g.template_name = s.template_name;
      }
      const f = g.byFile.get(s.file_id);
      if (f) {
        if (!f.data_types.includes(s.data_type)) f.data_types.push(s.data_type);
      } else {
        g.byFile.set(s.file_id, { file_name: s.file_name, data_types: [s.data_type] });
      }
    }
    return [...byKey.values()]
      .map((g) => ({
        template_id: g.template_id,
        template_type: g.template_type,
        template_name: g.template_name,
        usage_count: g.usage_count,
        file_count: g.byFile.size,
        by_file: [...g.byFile.entries()]
          .map(([file_id, v]) => ({ file_id, file_name: v.file_name, data_types: v.data_types }))
          .sort((a, b) => a.file_name.localeCompare(b.file_name, 'de')),
      }))
      .sort((a, b) => {
        const n = (a.template_name || a.template_id).localeCompare(b.template_name || b.template_id, 'de');
        if (n !== 0) return n;
        return a.template_id.localeCompare(b.template_id);
      });
  }

  /**
   * Fetches `/file/detail` for each recording in scope and aggregates all `used_template` entries from `content_list`.
   * (Does not load S3 summary JSON; only what Plaud puts on file detail — same source as in the web app structure.)
   */
  async listUsedTemplates(options: {
    scope?: 'live' | 'trash' | 'all';
    requestDelayMs?: number;
  } = {}): Promise<PlaudListUsedTemplatesResult> {
    const scope = options.scope ?? 'live';
    const delay = options.requestDelayMs ?? 0;
    let list: PlaudRecording[] = [];
    if (scope === 'live') {
      list = (await this.listFilesRaw(false)).filter((f) => !f.is_trash);
    } else if (scope === 'trash') {
      list = (await this.listFilesRaw(true)).filter((f) => f.is_trash);
    } else {
      const a = await this.listFilesRaw(false);
      const b = await this.listFilesRaw(true);
      const m = new Map<string, PlaudRecording>();
      for (const f of a) m.set(f.id, f);
      for (const f of b) m.set(f.id, f);
      list = [...m.values()];
    }
    const slots: PlaudUsedTemplateSlot[] = [];
    const details_errors: { file_id: string; error: string }[] = [];
    for (let i = 0; i < list.length; i++) {
      if (delay > 0 && i > 0) await new Promise((r) => setTimeout(r, delay));
      const rec = list[i]!;
      try {
        const d = await this.getFileDetailData(rec.id);
        const name = (typeof d.file_name === 'string' && d.file_name) || rec.filename;
        for (const row of this.extractUsedTemplatesFromDetail(d, rec.id, name)) {
          slots.push({ ...row, file_id: rec.id, file_name: name });
        }
      } catch (e) {
        details_errors.push({ file_id: rec.id, error: (e as Error).message });
      }
    }
    const details_ok = list.length - details_errors.length;
    return {
      files_scanned: list.length,
      details_ok,
      details_errors,
      slots,
      templates: this.aggregateUsedTemplateSlots(slots),
    };
  }

  /**
   * Same full scan as {@link listUsedTemplates}, plus optional `search` to narrow rows and resolve **template id** from a human-readable name (substring match).
   */
  async getUsedTemplates(options: {
    scope?: 'live' | 'trash' | 'all';
    requestDelayMs?: number;
    /** Case-insensitive substring match on `template_name`, `template_id`, and `template_type`. */
    search?: string;
  } = {}): Promise<PlaudGetUsedTemplatesResult> {
    const base = await this.listUsedTemplates({
      scope: options.scope,
      requestDelayMs: options.requestDelayMs,
    });
    const raw = options.search?.trim() ?? '';
    if (!raw) {
      return {
        ...base,
        search: null,
        matched_templates: base.templates,
        resolved_template_id: null,
        resolved: null,
      };
    }
    const q = raw.toLowerCase();
    const matched = base.templates.filter((t) => {
      if (t.template_id.toLowerCase().includes(q)) return true;
      if (t.template_type.toLowerCase().includes(q)) return true;
      if (t.template_name && t.template_name.toLowerCase().includes(q)) return true;
      return false;
    });
    let resolved: PlaudUsedTemplateRow | null = null;
    let resolved_template_id: string | null = null;
    if (matched.length === 1) {
      resolved = matched[0]!;
      resolved_template_id = resolved.template_id;
    }
    return {
      ...base,
      search: raw,
      matched_templates: matched,
      resolved_template_id,
      resolved,
    };
  }

  async getRecording(id: string): Promise<PlaudRecordingDetail> {
    const raw = await this.getFileDetailData(id);
    let transcript = '';
    const preDownload: Array<{ data_content?: string }> = raw.pre_download_content_list ?? [];
    for (const item of preDownload) {
      const content = item.data_content ?? '';
      if (content.length > transcript.length) transcript = content;
    }
    return {
      ...raw,
      id: (raw.file_id as string) ?? id,
      filename: (raw.file_name as string) ?? (raw as { filename?: string }).filename ?? id,
      transcript,
    } as PlaudRecordingDetail;
  }

  async getUserInfo(): Promise<PlaudUserInfo> {
    const data = await this.request('/user/me');
    const user = (data.data_user ?? data.data) as Record<string, unknown>;
    return {
      id: String(user.id),
      nickname: String(user.nickname ?? ''),
      email: String(user.email ?? ''),
      country: String(user.country ?? ''),
      membership_type: (data as { data_state?: { membership_type?: string } }).data_state?.membership_type ?? 'unknown',
    };
  }

  /**
   * `POST /share/public/create` — public share (web “Share”). Real body shape:
   * `{ object_id, object_type: "file", content_config: { audio, transcript, highlights, overview, notes: string[] } }`.
   * You can pass a full `body` (from DevTools) or set `file_id` + `content_config` (defaults fill gaps).
   */
  async createPublicShare(args: {
    /** File id; sent as `object_id` when not using a full `body`. */
    file_id?: string;
    object_id?: string;
    object_type?: string;
    /** Merged on top of defaults: audio/transcript true, highlights 0, overview false, notes from arg or []. */
    content_config?: Record<string, unknown>;
    /** Merged on top of the built object (rare; prefer `content_config`). */
    extra?: Record<string, unknown>;
    body?: Record<string, unknown>;
    timezone?: string;
  }): Promise<Record<string, unknown>> {
    const h: Record<string, string> = {};
    if (args.timezone) h['timezone'] = args.timezone;
    if (args.body !== undefined) {
      return this.request('/share/public/create', { method: 'POST', body: args.body, headers: h });
    }
    const oid = args.object_id ?? args.file_id;
    if (!oid) {
      throw new Error('createPublicShare: set `body`, or `file_id` / `object_id`');
    }
    const defaultConfig: Record<string, unknown> = {
      audio: true,
      transcript: true,
      highlights: 0,
      overview: false,
      notes: [] as string[],
    };
    const content_config = {
      ...defaultConfig,
      ...args.content_config,
    };
    const body = {
      object_id: oid,
      object_type: args.object_type ?? 'file',
      content_config,
      ...args.extra,
    };
    return this.request('/share/public/create', { method: 'POST', body, headers: h });
  }

  /** `content_list` types that belong in `content_config.notes` (not `transaction` / `outline` blobs). */
  private static readonly sharePayloadNoteDataTypes = new Set([
    'auto_sum_note',
    'sum_multi_note',
    'consumer_note',
  ]);

  /**
   * Lists KI summaries / notepad entries for sharing: `auto_sum_note`, `sum_multi_note`, `consumer_note`
   * with `data_id`, tab title, and `used_template` (choose by `data_id` or `template_id` in `createPublicShareForFile`).
   */
  async listShareableNotesForFile(fileId: string): Promise<PlaudShareableNoteItem[]> {
    const d = await this.getFileDetailData(fileId);
    const cl = d.content_list;
    const out: PlaudShareableNoteItem[] = [];
    if (!Array.isArray(cl)) return out;
    for (const c of cl) {
      if (!c || typeof c !== 'object') continue;
      const o = c as Record<string, unknown>;
      const dataId = o.data_id;
      const t = o.data_type;
      if (typeof dataId !== 'string' || typeof t !== 'string' || !PlaudClient.sharePayloadNoteDataTypes.has(t)) {
        continue;
      }
      const extra = o.extra;
      const ut = extra && typeof extra === 'object' ? (extra as { used_template?: Record<string, unknown> }).used_template : undefined;
      out.push({
        data_id: dataId,
        data_type: t,
        data_title: String(o.data_title ?? ''),
        data_tab_name: String(o.data_tab_name ?? ''),
        template_id: typeof ut?.template_id === 'string' ? ut.template_id : null,
        template_name: typeof ut?.template_name === 'string' ? ut.template_name : null,
        template_type: typeof ut?.template_type === 'string' ? ut.template_type : null,
      });
    }
    return out;
  }

  /**
   * Fills `content_config.notes` for `POST /share/public/create` from `listShareableNotesForFile` by default
   * (or a subset). Use `note_data_ids` to include only given blocks, or `template_ids` to filter by
   * `used_template.template_id` (e.g. one Jour-Fixe custom id).
   */
  async createPublicShareForFile(
    fileId: string,
    options?: {
      timezone?: string;
      content_config?: Record<string, unknown>;
      /** If set, only these `data_id` values (must be shareable; see `listShareableNotesForFile`). */
      note_data_ids?: string[];
      /** If set and `note_data_ids` is not, only notes whose `template_id` is in this list. */
      template_ids?: string[];
    },
  ): Promise<Record<string, unknown>> {
    const items = await this.listShareableNotesForFile(fileId);
    const byId = new Map(items.map((i) => [i.data_id, i] as const));

    let noteIds: string[];
    if (options?.note_data_ids && options.note_data_ids.length > 0) {
      for (const id of options.note_data_ids) {
        if (!byId.has(id)) {
          throw new Error(
            `createPublicShareForFile: data_id not in shareable set for this file: ${id}. Use listShareableNotesForFile.`,
          );
        }
      }
      noteIds = [...options.note_data_ids];
    } else if (options?.template_ids && options.template_ids.length > 0) {
      const s = new Set(options.template_ids);
      noteIds = items.filter((i) => i.template_id && s.has(i.template_id)).map((i) => i.data_id);
    } else {
      noteIds = items.map((i) => i.data_id);
    }

    return this.createPublicShare({
      file_id: fileId,
      content_config: {
        audio: true,
        transcript: true,
        highlights: 0,
        overview: false,
        notes: noteIds,
        ...options?.content_config,
      },
      timezone: options?.timezone,
    });
  }

  // --- Content: transcript / summary / notes (S3) ---

  private async findContentDataLink(
    fileId: string,
    dataType: string,
  ): Promise<{ data_type?: string; data_link?: string; data_id?: string } | null> {
    const detail = await this.getFileDetailData(fileId);
    return detail.content_list?.find((c) => c.data_type === dataType) ?? null;
  }

  async fetchS3Text(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
    return res.text();
  }

  async fetchS3Json<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getTranscriptContent(
    fileId: string,
    type: 'raw' | 'polished' = 'raw',
  ): Promise<string> {
    const dataType = type === 'polished' ? 'transaction_polish' : 'transaction';
    const item = await this.findContentDataLink(fileId, dataType);
    if (!item?.data_link) {
      return JSON.stringify({ error: `No ${dataType} content` });
    }
    const text = await this.fetchS3Text(item.data_link);
    const trimmed = text.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return text;
    }
    return text;
  }

  async getSummaryText(fileId: string): Promise<string> {
    const item = await this.findContentDataLink(fileId, 'auto_sum_note');
    if (!item?.data_link) {
      return JSON.stringify({ error: 'No auto_sum_note content' });
    }
    return this.fetchS3Text(item.data_link);
  }

  getNotesFromDetail(detail: FileDetailData): unknown {
    return detail.note_list ?? [];
  }

  async getTranscriptSegmentsForExport(
    fileId: string,
  ): Promise<
    Array<{ start_time: number; end_time: number; content: string; speaker: string; original_speaker?: string; [k: string]: unknown }>
  > {
    const polished = await this.findContentDataLink(fileId, 'transaction_polish');
    const raw = await this.findContentDataLink(fileId, 'transaction');
    const source = polished?.data_link ? polished : raw;
    if (!source?.data_link) return [];
    return this.fetchS3Json(source.data_link);
  }

  private formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private formatSrtTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const millis = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  async exportTranscript(args: {
    file_id: string;
    format?: 'txt' | 'srt';
    include_timestamps?: boolean;
    include_speakers?: boolean;
  }): Promise<string> {
    type Seg = { start_time: number; end_time: number; content: string; speaker: string; original_speaker?: string };
    const segments: Seg[] = (await this.getTranscriptSegmentsForExport(args.file_id)) as Seg[];
    if (!Array.isArray(segments) || segments.length === 0) {
      return JSON.stringify({ error: 'No transcript segments. Generate a transcript first.' });
    }
    const format = args.format ?? 'txt';
    const includeTimestamps = args.include_timestamps !== false;
    const includeSpeakers = args.include_speakers !== false;
    if (format === 'srt') {
      const lines: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        lines.push(String(i + 1));
        lines.push(`${this.formatSrtTime(seg.start_time)} --> ${this.formatSrtTime(seg.end_time)}`);
        const prefix = includeSpeakers && seg.speaker ? `${seg.speaker}: ` : '';
        lines.push(`${prefix}${seg.content}`);
        lines.push('');
      }
      return lines.join('\n');
    }
    const lines: string[] = [];
    for (const seg of segments) {
      const parts: string[] = [];
      if (includeTimestamps) parts.push(this.formatMs(seg.start_time));
      if (includeSpeakers && seg.speaker) parts.push(seg.speaker);
      if (parts.length > 0) lines.push(parts.join(' '));
      lines.push(seg.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  // --- Audio ---

  async downloadAudio(id: string): Promise<ArrayBuffer> {
    const token = await this.auth.getToken();
    const res = await fetch(`${this.baseUrl}/file/download/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res.arrayBuffer();
  }

  async getMp3Url(id: string, isOpus = false): Promise<string | null> {
    try {
      const data = await this.request(`/file/temp-url/${id}?is_opus=${isOpus ? 'true' : 'false'}`);
      return (data?.url as string) ?? (data?.data as { url?: string } | undefined)?.url ?? (data?.temp_url as string) ?? null;
    } catch {
      return null;
    }
  }

  // --- Folders ---

  async listFolders(): Promise<{ id: string; name: string | null }[]> {
    const res = await this.request('/filetag/');
    const list = (res as { data_filetag_list?: Array<{ id: string; name?: string }> }).data_filetag_list ?? [];
    return list.map((f) => ({ id: f.id, name: f.name ?? null }));
  }

  // --- Mutations ---

  async renameFile(fileId: string, newName: string): Promise<Record<string, unknown>> {
    return this.request(`/file/${fileId}`, { method: 'PATCH', body: { filename: newName } });
  }

  async moveToFolder(fileId: string, folderId: string): Promise<Record<string, unknown>> {
    return this.request(`/file/${fileId}`, { method: 'PATCH', body: { filetag_id_list: [folderId] } });
  }

  async trashFile(fileId: string): Promise<Record<string, unknown>> {
    return this.request(`/file/${fileId}`, { method: 'PATCH', body: { is_trash: true } });
  }

  async generateTranscriptSummary(
    fileId: string,
    options: {
      language?: string;
      speaker_labeling?: boolean;
      llm?: string;
      template_id?: string;
      template_type?: string;
    } = {},
  ): Promise<Record<string, unknown>> {
    const language = options.language ?? 'auto';
    const diarization = options.speaker_labeling !== false ? 1 : 0;
    const llm = options.llm ?? 'auto';
    const summType = options.template_id ?? 'AUTO-SELECT';
    const summTypeType = options.template_id ? (options.template_type ?? 'community') : 'system';
    const body = {
      is_reload: 0,
      summ_type: summType,
      summ_type_type: summTypeType,
      info: JSON.stringify({
        language,
        timezone: new Date().getTimezoneOffset() / -60,
        diarization,
        llm,
      }),
      support_mul_summ: true,
    };
    return this.request(`/ai/transsumm/${fileId}`, { method: 'POST', body });
  }

  async batchRename(renames: { file_id: string; new_name: string }[]): Promise<
    { file_id: string; new_name: string; success: boolean }[]
  > {
    const out: { file_id: string; new_name: string; success: boolean }[] = [];
    for (const item of renames) {
      const res = (await this.request(`/file/${item.file_id}`, {
        method: 'PATCH',
        body: { filename: item.new_name },
      })) as { status?: number };
      out.push({
        file_id: item.file_id,
        new_name: item.new_name,
        success: res.status === 0,
      });
      await new Promise((r) => setTimeout(r, 500));
    }
    return out;
  }

  async nameSpeakers(
    fileId: string,
    renames: { old_name: string; new_name: string }[],
  ): Promise<Record<string, unknown>> {
    const detail = (await this.request(`/file/detail/${fileId}`)) as { data?: FileDetailData };
    const d = detail.data;
    if (!d?.content_list) return { error: 'No file detail' };
    const polished = d.content_list.find((c) => c.data_type === 'transaction_polish');
    const rawT = d.content_list.find((c) => c.data_type === 'transaction');
    const source = polished?.data_link ? polished : rawT;
    if (!source?.data_link) {
      return { error: 'No transcript. Generate a transcript first.' };
    }
    const transcriptRes = await fetch(source.data_link);
    if (!transcriptRes.ok) throw new Error(`S3: ${transcriptRes.status}`);
    const segments: SpeakerSeg[] = (await transcriptRes.json()) as SpeakerSeg[];
    const renameMap = new Map(renames.map((r) => [r.old_name.toLowerCase(), r.new_name] as const));
    let renamed = 0;
    for (const seg of segments) {
      const n = renameMap.get(seg.speaker.toLowerCase());
      if (n) {
        seg.speaker = n;
        renamed++;
      }
    }
    if (renamed === 0) {
      const currentSpeakers = [...new Set(segments.map((s) => s.speaker))];
      return { error: 'No matching speakers', current_speakers: currentSpeakers };
    }
    const patchRes = (await this.request(`/file/${fileId}`, {
      method: 'PATCH',
      body: { trans_result: segments, support_mul_summ: true },
    })) as { status?: number };
    await this.request('/ai/update_source_info', {
      method: 'POST',
      body: {
        file_id: fileId,
        source_type: source.data_type,
        source_id: source.data_id,
        source_content: JSON.stringify(segments),
      },
    });
    return {
      success: patchRes.status === 0,
      segments_renamed: renamed,
      speakers: [...new Set(segments.map((s) => s.speaker))],
    };
  }

  /**
   * Push structured transcript segments to Plaud (same path as “upload transcript” in reference servers).
   */
  async uploadTranscriptSegments(
    fileId: string,
    segments: unknown[],
  ): Promise<Record<string, unknown>> {
    if (!Array.isArray(segments) || segments.length === 0) {
      return { error: 'trans_result is empty' };
    }
    return this.request(`/file/${fileId}`, { method: 'PATCH', body: { trans_result: segments, support_mul_summ: true } });
  }
}
