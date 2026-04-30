/**
 * `start_time` from Plaud is ms since epoch (absolute instant). `Date#toISOString()` is
 * always UTC, which is often ~1–2h off the time shown in the Plaud app (local wall time).
 * These formatters use the host's local timezone so list/MCP match the web app titles.
 */
export function formatPlaudLocalDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

export function formatPlaudLocalDateYmd(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
