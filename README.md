# Bilo Notes

Minimal note-taking app for creative professionals. Grayscale neobrutalist UI, rich-text editor with slash commands, calendar, local AI via Cursor/Kiro ACP, Jira tickets, and GitHub sync.

Built with **Tauri 2** (Rust) + **React** + **Tiptap**.

---

## Quick start

### Requirements

| Tool | Version |
|------|---------|
| macOS | Primary target (Reminders integration is macOS-only) |
| Node.js | 20+ |
| Rust | stable (`rustup default stable`) |
| Cursor CLI or Kiro agent | For AI features |

### Install & run (development)

```bash
git clone https://github.com/DominikWawak/bilo.git
cd bilo
npm install
npm run tauri dev
```

Frontend-only (no Tauri shell — Jira, Reminders, and AI will not work):

```bash
npm run dev
# → http://localhost:1420
```

### Build a macOS app

```bash
npm run tauri build
# .dmg in src-tauri/target/release/bundle/dmg/
```

### Install from release

Push a version tag to trigger a release build:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

GitHub Actions builds a universal macOS `.dmg` and attaches it to a draft release.

---

## What you can do

| Area | Capability |
|------|------------|
| Write | Blank canvas editor, dedicated title field, note timestamp |
| Structure | Sections (tree), fold/collapse, move notes between sections |
| Format | Headings, lists, todos, tables, code, quotes, dividers |
| Embed | Mermaid diagrams, images (resizable), PDFs (inline viewer), doodles, calculator |
| Calendar | Month / week / day views, auto-resize, `/log` blocks, `@` reminders |
| Search | Global palette (⌘K), in-note find (⌘F) |
| AI | `/ai` query bar, text Enhance, note organize preview |
| Integrate | Jira ticket cards, macOS Reminders, Cursor chat import, GitHub sync |
| Zoom | Pinch / Ctrl+scroll on note canvas |

---

## UI tour

### Editor

Blank writing surface. Corner **≡** opens the sidebar. Each note has a title field and created/updated timestamp.

![Editor demo](https://raw.githubusercontent.com/DominikWawak/bilo/main/docs/gifs/editor.gif)

### Slash commands

Type `/` anywhere in a note to open the command menu.

![Slash menu demo](https://raw.githubusercontent.com/DominikWawak/bilo/main/docs/gifs/slash-menu.gif)

| Command | Action |
|---------|--------|
| `/h1` `/h2` `/h3` | Headings |
| `/list` | Bullet list |
| `/ordered` | Numbered list |
| `/todo` | Interactive checkbox list |
| `/table` | 3×3 table |
| `/code` | Code block |
| `/quote` | Blockquote |
| `/divider` | Horizontal rule |
| `/log` | Dated log block (shows on calendar) |
| `/diagram` | Mermaid diagram block |
| `/image` | Image from file picker (drag-resize handle) |
| `/pdf` | PDF attachment with inline viewer |
| `/doodle` | Freehand sketch canvas (pen/eraser, export PNG) |
| `/calculate` | Inline calculator (click or keyboard input) |
| `/jira` | Paste a Jira URL → inline ticket card |
| `/ai` | Open AI query bar |
| `/organize` | AI reorganize current note (preview → Accept/Discard) |

### Sidebar & sections

Create notes, organize into indented sections, fold sections, toggle **Show on calendar** per section, delete/rename from the section menu.

![Sidebar demo](https://raw.githubusercontent.com/DominikWawak/bilo/main/docs/gifs/sidebar.gif)

### Calendar

Open from sidebar **Calendar** tab. Auto-switches month → week → day based on window width. Click a day to drill into day view. Shows:

- Notes in sections with **Show on calendar** enabled
- `/log` block entries on their log date
- `@` reminder badges from notes

![Calendar demo](https://raw.githubusercontent.com/DominikWawak/bilo/main/docs/gifs/calendar.gif)

### Search

**⌘K** — search all notes (title + body, in-memory index).  
**⌘F** — find within the current note.

![Search demo](https://raw.githubusercontent.com/DominikWawak/bilo/main/docs/gifs/search.gif)

### Rich blocks

Todo lists and tables via slash commands.

![Blocks demo](https://raw.githubusercontent.com/DominikWawak/bilo/main/docs/gifs/blocks.gif)

### Settings

Full-page settings (⚙ in sidebar footer). Searchable sections for AI, Jira, GitHub sync, and import.

![Settings demo](https://raw.githubusercontent.com/DominikWawak/bilo/main/docs/gifs/settings.gif)

---

## AI

AI runs through **Cursor ACP** (`cursor-agent`) or **Kiro ACP** (`kiro-agent`). No Ollama/llama.cpp in the current build.

### Setup

1. Open **Settings → AI**
2. Choose agent: **Cursor** or **Kiro**
3. Paste your API key
4. Optionally add **Personal context** (included on every query)

Agents are probed on load — green dot = binary found.

### `/ai` query bar

- Type `/ai` or use **Enhance** on selected text
- Uses **current note only** as context (fast)
- **Replace** or **Insert** the answer; checkboxes render as interactive todos
- Loading state persists when switching views (calendar/settings)
- Cancel while waiting

### Enhance (text selection)

Select text → **Enhance** button → `/ai` bar opens with selection as context → type your instruction → Replace or Insert.

### Organize

`/organize` sends the note to AI, shows a preview bar at the bottom. Accept replaces the note body; Discard keeps original.

Background tasks (organize, Cursor import, GitHub sync) show a task pill in the bottom-right.

---

## Reminders (`@`)

Type `@` at the start of a line:

| Preset | Time |
|--------|------|
| Today | 5:00 PM |
| Tomorrow | 9:00 AM |
| This Friday | 9:00 AM |
| Next Monday | 9:00 AM |
| Pick date & time… | Custom picker overlay |

Creates a badge in the note and adds a **macOS Reminder** (syncs to iPhone via iCloud). Reminders also appear on the in-app calendar.

---

## Jira

**Settings → Jira**: Base URL, email, API token ([create at Atlassian](https://id.atlassian.com/manage-profile/security/api-tokens)).

- Paste a Jira link → auto-converts to inline ticket card
- `/jira` → paste URL in overlay
- Click ticket → opens in system browser

---

## GitHub sync

**Settings → GitHub Sync**

- Repository URL + personal access token (`repo` scope)
- **Push** / **Pull** notes + sections as JSON
- Auto-sync interval: manual, 5 min, 15 min, 1 hour

Data keys synced: `bilo-notes-store`, `bilo-sections-store`.

---

## Import

**Settings → Import**

| Source | Description |
|--------|-------------|
| Notes JSON | Load from a file path (merge/replace by note ID) |
| Cursor chats | Toggle on → set transcripts dir (`~/.cursor/projects`) → summarises sessions into notes |

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘N | New note |
| ⌘K | Global search |
| ⌘F | Find in note |
| Esc | Close search / sidebar / settings |
| Ctrl + scroll | Zoom note canvas (0.5×–2.5×) |

---

## Data storage

All note data is stored locally in the Tauri webview's `localStorage`:

| Key | Contents |
|-----|----------|
| `bilo-notes-store` | Notes array |
| `bilo-sections-store` | Sections array |
| `bilo-ai-runtime-settings` | AI + Jira settings |
| `bilo-sync-*` | GitHub sync config |
| `bilo-automation-schedule` | Automation schedule |

No cloud unless you enable GitHub sync.

---

## Project structure

```
bilo/
├── src/                  React frontend
│   ├── App.tsx           Shell, routing, AI orchestration
│   └── features/
│       ├── notes/        Tiptap editor, sidebar, stores
│       ├── calendar/     Month/week/day views
│       ├── ai/           Settings, aiService, ACP calls
│       ├── search/       Search palette + index
│       ├── jira/         Ticket fetch + display
│       └── tasks/        Background task status bar
├── src-tauri/            Rust backend (Tauri commands)
├── docs/gifs/            README demo GIFs
└── scripts/              Utility scripts
```

---

## Scripts

```bash
npm run dev          # Vite dev server (port 1420)
npm run build        # Production frontend build
npm run tauri dev    # Full desktop app
npm run tauri build  # macOS .dmg
npm test             # Vitest unit tests
npm run lint         # ESLint
```

### Re-record README GIFs

Requires [gifski](https://gif.ski/) (`brew install gifski`) and Playwright (dev dependency).

```bash
npm run dev   # in one terminal
node scripts/capture-readme-gifs.mjs
```

The script clears `localStorage`, seeds demo data, captures frames, and writes GIFs to `docs/gifs/`. No personal notes are included.

---

## CI / releases

| Workflow | Trigger | Output |
|----------|---------|--------|
| `.github/workflows/ci.yml` | PR + push to `main`/`dev` | macOS build artifact |
| `.github/workflows/release.yml` | Tag `v*.*.*` | Draft release + universal `.dmg` |
| Dependabot | Weekly | npm, Cargo, GitHub Actions updates |

---

## Platform notes

- **macOS**: Full feature set (Reminders, native PDF viewer, system browser)
- **iOS**: Tauri mobile scaffold exists; not primary target yet
- **AI latency**: First `cursor-agent` spawn can take several seconds; check terminal logs prefixed `[bilo/ai]`

---

## License

[MIT](LICENSE) © 2026 Dominik Wawak
