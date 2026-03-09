# Personal OS Hub — Spec

## Overview
Chrome Extension (MV3) that treats your Obsidian vault as a living knowledge base, surfaced through AI-powered slash commands and a daily digest.

## Architecture
```
Chrome Extension (MV3)
├── popup/         — React app (quick commands + digest)
├── sidepanel/     — React app (full dashboard)
├── background/    — Service worker (vault indexer, agent orchestrator)
├── content/       — (optional) page context injector
└── lib/
    ├── vault.js   — File System Access API reader + markdown parser
    ├── index.js   — In-memory vector-like index (TF-IDF + links)
    ├── claude.js  — Anthropic API client (token-compressed prompts)
    └── agents.js  — Multi-agent router
```

## Vault Access
- Use `window.showDirectoryPicker()` on first run → store handle via `chrome.storage.local`
- Recursively read `.md` files; parse frontmatter + wikilinks `[[note]]`
- Build link graph: `{ note → [linked notes] }`
- Token compression: summarize notes >500 tokens; cache summaries in `chrome.storage.local`

## Slash Commands
| Command | Behavior |
|---|---|
| `/context` | Load current life/work state from daily notes + MOCs |
| `/trace <topic>` | Show idea evolution across dates via link graph |
| `/connect` | Bridge two domains — find hidden connections |
| `/ideas` | Generate startup ideas from vault patterns |
| `/graduate <note>` | Promote a raw thought → polished asset (saves to `_assets/`) |
| `/delegate <sentence>` | Hand off to sub-agent for execution plan |

## Daily Digest
- Triggered at configurable time (default 8am) via `chrome.alarms`
- Scans: new notes (last 24h), orphaned notes, recurring themes
- Output: concise briefing saved to `_digests/YYYY-MM-DD.md` (read-only agent output folder)

## Agent Rules
- Agents write ONLY to `_agents/` and `_digests/` folders
- Human vault is read-only for agents
- No overwriting existing notes

## Storage
- `chrome.storage.local`: vault directory handle, note summaries cache, settings
- `chrome.storage.session`: current session index

## UI
- **Popup** (400×500px): command bar + recent output
- **Side Panel** (full height): vault explorer + digest viewer + agent log

## Settings
- Vault path (re-pick folder)
- Claude API key
- Digest time
- Which folders to exclude (e.g. `Templates/`, `Archive/`)
