# plaud-connector

[![GitHub](https://img.shields.io/badge/repo-rggnkmp%2Fplaud--connector-181717?logo=github)](https://github.com/rggnkmp/plaud-connector)
[![License](https://img.shields.io/badge/license-MIT-green)](#license-and-references)

**Alpha.** Unofficial TypeScript toolkit for the [Plaud](https://www.plaud.ai/) cloud: **`@plaud/core`** (library), **`@plaud/cli`** (terminal client), **`@plaud/mcp`** ([Model Context Protocol](https://modelcontextprotocol.io/) server for Cursor, Claude Desktop, and other MCP hosts).

**What it is for:** programmatic access to *your* Plaud recordings—list and search meetings, pull **raw or polished** transcripts and AI summaries, download **MP3** (or temporary signed URLs), **sync** new files to a local folder, **rename / move / trash** items, trigger **AI re-generation**, build **public share** links, and expose the same capabilities to an LLM via **31 MCP tools**. Consumer traffic targets **`api.plaud.*`**; developer traffic targets **`platform.plaud.ai`** (OAuth, compatible token layout with Plaud’s [`@plaud-ai/mcp`](https://www.npmjs.com/package/@plaud-ai/mcp) npm package).

**Disclaimer:** not affiliated with Plaud; behaviour is reverse-engineered from the web app. Use at your own risk.

---

### Contents

1. [What you can do (overview)](#what-you-can-do-overview)  
2. [Example use cases](#example-use-cases)  
3. [Install](#install)  
4. [Authentication](#authentication)  
5. [Monorepo packages](#monorepo-packages)  
6. [Complete inventory: npm scripts, CLI, MCP tools, core exports](#complete-inventory-npm-scripts-cli-mcp-tools)  
7. [MCP server: Cursor and other clients](#mcp-server-cursor-and-other-clients)  
8. [Token lifetime](#token-lifetime)  
9. [Build and tests](#build-and-tests)  
10. [License and references](#license-and-references)

---

## What you can do (overview)

| Layer | Purpose |
| --- | --- |
| **`@plaud/core`** | Session handling (password, OAuth PKCE, pasted JWTs), **`PlaudClient`** for the consumer API, **`PlaudDeveloperClient`** for the developer platform API, config under `~/.plaud/`, token refresh (~300-day consumer tokens, refresh when close to expiry). |
| **`@plaud/cli`** | One-shot terminal workflows: login, list/download/transcript/sync, token import, template usage reports. |
| **`@plaud/mcp`** | Same capabilities over MCP so an agent can **search**, **read**, **export**, **organise**, and **mutate** Plaud content in a chat session. |

Low-level HTTP helpers live on **`PlaudClient`** / **`PlaudDeveloperClient`** in `packages/core/src/`; the CLI and MCP server call into them. For behaviour not covered here, read the TypeScript sources.

---

## Example use cases

| Use case | How |
| --- | --- |
| **Nightly backup of new recordings** | CLI `sync ./archive/` (after `login` or OAuth); or MCP `plaud_list_files` / `plaud_query_recordings` then `plaud_get_temp_audio_url` / download. |
| **Search “Q4 planning” across titles** | MCP `plaud_query_recordings` with `title_contains`; or `plaud_search_files` with `query` / dates. |
| **Export subtitles for editing** | MCP `plaud_export_transcript` with `format: "srt"`; CLI `transcript <id>` for a quick text dump. |
| **Ask Cursor to summarise last week’s meetings** | Enable MCP, `plaud_search_files` with `start_date` / `end_date`, then `plaud_get_summary` / `plaud_get_notes` per `file_id`. |
| **Google SSO only (no Plaud password)** | `login-oauth` (CLI) or MCP `plaud_oauth_login`; then use `plaud_dev_*` and consumer tools as your session allows. |
| **Stuck OAuth page, have Network tab** | `import-token app …` for consumer JWT; `import-token dev …` for platform JWT if available. |
| **Bulk rename after import** | MCP `plaud_batch_rename` with `{ renames: [{ file_id, new_name }, …] }`. |
| **Report which AI templates you actually used** | CLI `used-templates --json`; MCP `plaud_list_used_templates` (`live` / `trash` / `all`). |
| **Create a web share like the Plaud app** | MCP `plaud_list_shareable_notes` → `plaud_create_public_share` with chosen `note_data_ids` or `template_ids` (or paste full `body` from DevTools). |
| **Developer dashboard parity** | MCP `plaud_dev_list_files` / `plaud_dev_get_file` / `plaud_dev_get_transcript` with developer OAuth. |

---

## Install

**Requirements:** Node.js **v20+**, **npm** (workspace monorepo).

```bash
git clone https://github.com/rggnkmp/plaud-connector.git
cd plaud-connector
npm install
```

---

## Authentication

| Surface | Host | When to use |
| --- | --- | --- |
| **Consumer** | `api.plaud.*` (`us` / `eu`) | Email + password (`login`), or `import-token app`, or OAuth-backed consumer session when configured. |
| **Developer** | `platform.plaud.ai` | `login-oauth` / MCP `plaud_oauth_login`, or `import-token dev` if you have a platform JWT. |

**Config files under `~/.plaud/`** (tighten permissions, e.g. `0600`):

| File | Role |
| --- | --- |
| `config.json` | Password session + consumer tokens. |
| `tokens-mcp.json` | Developer OAuth tokens (layout compatible with `@plaud-ai/mcp`). |

**Google-only Plaud sign-in:** set a password via “Forgot password” on [web.plaud.ai](https://web.plaud.ai), or use **OAuth** (`login-oauth`).

---

## Monorepo packages

| Package | Role |
| --- | --- |
| `@plaud/core` | Auth, config, `PlaudClient`, `PlaudDeveloperClient`, datetime helpers. |
| `@plaud/cli` | `packages/cli/bin/plaud.ts` (run with `tsx`). |
| `@plaud/mcp` | Stdio MCP server: `packages/mcp/src/index.ts`. |

---

## Complete inventory: npm scripts, CLI, MCP tools

### A. Root `package.json` scripts

| Script | Description | Example |
| --- | --- | --- |
| `npm run build` | Compile TypeScript (`tsc -p tsconfig.json`). | `npm run build` before publishing a fork. |
| `npm test` | Run Vitest once. | CI: `npm test`. |
| `npm run test:watch` | Vitest watch mode. | Local TDD. |
| `npm run test:integration` | Integration tests for `@plaud/core` (needs real env + `PLAUD_INTEGRATION=1`). | `PLAUD_INTEGRATION=1 npm run test:integration` |
| `npm run mcp` | Start MCP server on stdio. | Pipe into an MCP host for debugging. |
| `npm run login` | Run CLI `login`. | First-time password setup. |
| `npm run login-oauth` | Run CLI `login-oauth` (browser; callback **8199**). | SSO / developer token. |
| `npm run import-token` | Run CLI `import-token`. | Paste JWT when OAuth UI breaks. |
| `npm run used-templates` | Run CLI `used-templates`. | Audit template usage. |
| `npm run setup-cursor` | Regenerate `.cursor/mcp.json`. | After moving the repo path. |

`postinstall` runs `node scripts/write-cursor-mcp.mjs` (Cursor MCP path bootstrap).

---

### B. CLI commands (`plaud …`)

**Invoke:** `npx tsx packages/cli/bin/plaud.ts <command> [args…]` — or `npm run …` where a script exists. **`--help`** prints usage.

| # | Command | Description | Example use case |
| ---: | --- | --- | --- |
| 1 | **`login`** | Interactive email, password, region (`us` / `eu`); writes consumer session to `~/.plaud/config.json`. | Laptop with Plaud password; you want `list` / `sync` without browser. |
| 2 | **`login-oauth`** / **`oauth`** | Browser OAuth (PKCE) for developer + consumer paths; writes `tokens-mcp.json`. | Google SSO; need `plaud_dev_*` and consumer MCP tools. |
| 3 | **`import-token`** | `import-token app <jwt\|file\|stdin>` stores consumer bearer; `import-token dev …` stores platform JWT. | Copied `Authorization` header from DevTools Network. |
| 4 | **`list`** | Prints recordings to stdout. | Quick inventory in terminal. |
| 5 | **`download <id> [dir]`** | Downloads audio for recording `id` into `dir` (default `.`). | Save one meeting MP3 into `./audio/`. |
| 6 | **`transcript <id>`** | Prints transcript text/JSON for `id`. | Pipe to file: `… transcript abc > note.txt`. |
| 7 | **`sync <folder>`** | Downloads **new** recordings into `folder` (incremental sync). | Local archive that stays up to date. |
| 8 | **`used-templates`** | Scans file details, aggregates `used_template` from `content_list`. Flags: `--all`, `--trash`, `--json`. | “Which summary templates did I actually use?” |

#### `import-token` quick steps

1. **`app`:** Browser → DevTools **Network** → request to `api.*plaud*` → copy JWT from `Authorization: Bearer …`.  
2. **`dev`:** Platform JWT only if you have it; else `login-oauth`.  
3. Run: `npm run import-token -- app "<jwt>"`

---

### C. MCP tools (31) — `packages/mcp/src/index.ts`

**Auth:** `plaud_oauth_*` / `plaud_dev_*` need **developer OAuth**. Most `plaud_*` need a **consumer** session (password or `import-token app` or OAuth-backed consumer—see server stderr on startup).

#### C.1 OAuth & developer API (7 tools)

| # | Tool | Description (from server) | Example use case |
| ---: | --- | --- | --- |
| 1 | `plaud_oauth_login` | Open browser, OAuth PKCE, save token to `~/.plaud/tokens-mcp.json` (same model as `@plaud-ai/mcp`). | First-time MCP setup on a machine with a browser. |
| 2 | `plaud_oauth_logout` | Remove OAuth token file; optionally revokes server-side. | Rotate account or wipe machine. |
| 3 | `plaud_dev_list_files` | Developer API: list files; optional `query` + `date_from` / `date_to` (client-side filter, up to ~500 rows). | Paginated “all files this month” for a dashboard script. |
| 4 | `plaud_dev_get_file` | Developer API: one file by `file_id`. | Fetch raw platform JSON for debugging. |
| 5 | `plaud_dev_get_transcript` | Developer API: transcript as `source_list` JSON from `getFile` (timestamps, speakers). | Feed structured segments into your own formatter. |
| 6 | `plaud_dev_get_notes` | Developer API: AI `note_list` for a file. | Read Plaud-generated notes without consumer file-detail shape. |
| 7 | `plaud_dev_get_current_user` | Developer API: current user. | Verify OAuth succeeded in MCP. |

#### C.2 Consumer API (24 tools)

| # | Tool | Description (from server) | Example use case |
| ---: | --- | --- | --- |
| 8 | `plaud_list_files` | List files with filter `all` / `untranscribed` / `transcribed`, optional min duration, pagination (`limit` ≤ 500). | “Show me untranscribed items longer than 2 minutes.” |
| 9 | `plaud_search_files` | Filter by title substring and/or ISO `start_date` / `end_date`. | “Meetings titled ‘standup’ in January.” |
| 10 | `plaud_get_file` | Full `/file/detail` JSON (metadata, `content_list`, `pre_download`, embeddings, …). | One-shot dump before offline analysis. |
| 11 | `plaud_get_metadata` | Metadata for many `file_ids`; merges live + trashed; returns `{ found, missing }`. | Reconcile IDs from an external list with Plaud. |
| 12 | `plaud_get_transcript` | Transcript from S3: **`raw`** (transaction) or **`polished`**; may be JSON segments or text. | Compare raw ASR vs edited transcript. |
| 13 | `plaud_get_summary` | AI summary text (`auto_sum_note`). | One-paragraph brief for a weekly digest email. |
| 14 | `plaud_get_notes` | `note_list` from detail (AI notes, action items). | Extract action items for a task tracker. |
| 15 | `plaud_export_transcript` | Export **`txt`** or **`srt`** from segment JSON; toggle timestamps / speakers. | Subtitle file for Premiere / Descript. |
| 16 | `plaud_get_user` | Current Plaud user / account info. | Confirm region and account id in agent context. |
| 17 | `plaud_get_temp_audio_url` | Short-lived signed URL for MP3 (optional **`is_opus`**). | Hand URL to ffmpeg / browser download when base64 is too large. |
| 18 | `plaud_list_shareable_notes` | Lists KI items that can go into a public share (`data_id`, `tab`, `template_id`). | Pick exactly which notes to include in `plaud_create_public_share`. |
| 19 | `plaud_create_public_share` | `POST /share/public/create` (web Share). Either `file_id` + optional `note_data_ids` / `template_ids`, or full `body` JSON from Network tab; optional `timezone` header. | Generate a share link like the Plaud UI. |
| 20 | `plaud_download_audio_base64` | Download raw audio; returns **base64** if size ≤ **4 MiB**, else error (use `plaud_get_temp_audio_url`). | Small clip inline in an MCP response. |
| 21 | `plaud_list_folders` | List folders / tags (`filetag`). | Build a folder picker UI in a script. |
| 22 | `plaud_list_used_templates` | Scan all recordings (`GET /file/detail` each), list distinct `used_template` from `content_list`; `scope`: `live` / `trash` / `all`; optional `request_delay_ms` (0–2000). | Compliance report: which templates were used across the library. |
| 23 | `plaud_rename_file` | Rename recording (`PATCH /file`). | Fix typo in meeting title. |
| 24 | `plaud_batch_rename` | Rename many files sequentially (500 ms gap). | Normalise titles after bulk import. |
| 25 | `plaud_move_to_folder` | Set folder/tag (replaces `filetag` list with one id). | Move all “Client A” notes into one tag. |
| 26 | `plaud_trash_file` | Move recording to trash. | Clean-up workflow from chat. |
| 27 | `plaud_generate` | Start AI transcript+summary job (`POST /ai/transsumm`); optional `language`, `speaker_labeling`, `llm`, `template_id`, `template_type`. | Re-run summary with a different template. |
| 28 | `plaud_name_speakers` | Rename speaker labels in stored transcript; sync via PATCH + `/ai/update_source_info`. | Replace “Speaker 2” with real names. |
| 29 | `plaud_upload_transcript_segments` | Write transcript as segment array (`PATCH trans_result`); `segments` is a **JSON string** of `[{ start_time, end_time, content, speaker, … }]`. | Import corrected transcript from an external editor. |
| 30 | `plaud_list_recordings` | Compact list of all **non-trashed** recordings (`id`, title, date, duration, `has_transcript`). | Fast agent overview without heavy filters. |
| 31 | `plaud_query_recordings` | In-memory filter: optional `title_contains`, `max_results` (≤ 500), `only_with_transcript`; newest first. | “Latest 20 notes mentioning ‘budget’ that have a transcript.” |

**Source of truth for defaults and optional fields:** Zod `inputSchema` next to each `registerTool` in **`packages/mcp/src/index.ts`**.

---

### D. `@plaud/core` public exports (library API)

Entry: **`packages/core/src/index.ts`**. It wires:

| Category | Main exports |
| --- | --- |
| **Auth (consumer)** | `PlaudAuth`, `PlaudOAuthConsumerAuth`, `IPlaudAuth` |
| **Config** | `PlaudConfig` |
| **Consumer client** | `PlaudClient` (`packages/core/src/client.ts`) |
| **Types** | `export type * from './types.js'` |
| **Date/time** | `formatPlaudLocalDateTime`, `formatPlaudLocalDateYmd` |
| **OAuth / developer** | `export * from './oauth/index.js'` — includes `PlaudOAuth`, `PlaudDeveloperClient`, `getDefaultMcpOAuthConfig`, `runPlaudOAuthLogin`, `PlaudTokenStore`, OAuth helpers, and related types (see `packages/core/src/oauth/`). |

**Note:** Cloud operations (list, download, transcript, trash, …) are **methods** on `PlaudClient` / `PlaudDeveloperClient`, not top-level functions. For the complete method list, open **`packages/core/src/client.ts`** and **`packages/core/src/plaud-developer-client.ts`**.

---

## MCP server: Cursor and other clients

**Entrypoint:** `packages/mcp/src/index.ts` (stdio).

### Cursor

1. Open **`plaud-connector.code-workspace`** (repo root).  
2. `npm install` — **`postinstall`** writes **`.cursor/mcp.json`** with an absolute path to `scripts/mcp-stdio.mjs`.  
3. `npm run setup-cursor` if the file is missing after moving the repo.  
4. Restart **Cursor**.  
5. Run **`npm run login`** and/or **`npm run login-oauth`** on the same machine (or copy token files).  
6. Enable MCP server **plaud-connector** in the IDE.

**Debug:** *View → Output* → **MCP**. Optional env: **`PLAUD_MCP_ROOT`** (monorepo root).

### Other MCP hosts

```json
{
  "mcpServers": {
    "plaud-connector": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/plaud-connector/packages/mcp/src/index.ts"]
    }
  }
}
```

---

## Token lifetime

Consumer tokens issued after **password login** last on the order of **~300 days**. `@plaud/core` refreshes them when expiry is within about **30 days**, provided `~/.plaud/config.json` remains valid.

---

## Build and tests

```bash
npm run build
npm test
# Optional — real Plaud credentials:
# PLAUD_INTEGRATION=1 npm run test:integration
```

---

## License and references

**MIT** — verify copyright text in [sergivalverde/plaud](https://github.com/sergivalverde/plaud) when redistributing; add a `LICENSE` file if you ship artifacts.

**This repo:** [rggnkmp/plaud-connector](https://github.com/rggnkmp/plaud-connector) (maintainer **[@rggnkmp](https://github.com/rggnkmp)**).

### Related repositories (inspiration / lineage)

| Repository | How it relates |
| --- | --- |
| **[sergivalverde/plaud](https://github.com/sergivalverde/plaud)** | **Upstream / fork parent (prior art).** Monorepo layout, consumer API usage, CLI/MCP shape; this project **forks and extends** that line. |
| **[audiobridge-ai/mcp-servers](https://github.com/audiobridge-ai/mcp-servers)** | **MCP ecosystem reference.** Collection of MCP servers and integration patterns; informed some **MCP wiring, tooling, and host-integration** decisions here (no code copied as a submodule). |
| **[npm: @plaud-ai/mcp](https://www.npmjs.com/package/@plaud-ai/mcp)** | **Plaud official MCP (npm).** **Developer OAuth** and **`tokens-mcp.json`** layout compatibility for `plaud_dev_*`; separate product, not vendored source. |
