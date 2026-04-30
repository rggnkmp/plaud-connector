export interface PlaudCredentials {
  email: string;
  password: string;
  region: 'us' | 'eu';
}

export interface PlaudTokenData {
  accessToken: string;
  tokenType: string;
  issuedAt: number;   // epoch ms
  expiresAt: number;  // epoch ms (decoded from JWT)
}

export interface PlaudConfig {
  credentials?: PlaudCredentials;
  token?: PlaudTokenData;
}

export const BASE_URLS: Record<string, string> = {
  us: 'https://api.plaud.ai',
  eu: 'https://api-euc1.plaud.ai',
};

export interface PlaudRecording {
  id: string;
  filename: string;
  fullname: string;
  filesize: number;
  duration: number;
  start_time: number;
  end_time: number;
  is_trash: boolean;
  is_trans: boolean;
  is_summary: boolean;
  keywords: string[];
  serial_number: string;
}

export interface PlaudRecordingDetail extends PlaudRecording {
  transcript: string;
  summary?: string;
}

export interface PlaudUserInfo {
  id: string;
  nickname: string;
  email: string;
  country: string;
  membership_type: string;
}

/** One `content_list` item that had `extra.used_template` in file detail. */
export interface PlaudUsedTemplateSlot {
  template_id: string;
  template_type: string;
  template_name: string | null;
  data_type: string;
  file_id: string;
  file_name: string;
}

/** Grouped by template; `by_file` lists which recordings used it (and for which data types). */
export interface PlaudUsedTemplateRow {
  template_id: string;
  template_type: string;
  template_name: string | null;
  usage_count: number;
  file_count: number;
  by_file: Array<{ file_id: string; file_name: string; data_types: string[] }>;
}

export interface PlaudListUsedTemplatesResult {
  files_scanned: number;
  details_ok: number;
  details_errors: { file_id: string; error: string }[];
  slots: PlaudUsedTemplateSlot[];
  templates: PlaudUsedTemplateRow[];
}

/** Items that go into `content_config.notes` for `POST /share/public/create` (KIsummaries/notes, not raw transcript S3). */
export interface PlaudShareableNoteItem {
  data_id: string;
  data_type: string;
  data_title: string;
  data_tab_name: string;
  template_id: string | null;
  template_name: string | null;
  template_type: string | null;
}
