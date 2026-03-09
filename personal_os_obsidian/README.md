# Personal OS Hub — Chrome Extension

AI-powered Obsidian vault OS with slash commands and daily digest.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Build the extension
```bash
npm run build
# or for watch mode during development:
npm run dev
```

### 3. Create placeholder icons
Create 3 PNG icons (16×16, 48×48, 128×128) in a `dist/icons/` folder.
You can use any square PNG and rename them:
```
dist/icons/icon16.png
dist/icons/icon48.png
dist/icons/icon128.png
```

### 4. Copy manifest to dist
After build, copy the manifest:
```bash
cp manifest.json dist/manifest.json
```

Or add this to your vite config's `publicDir` or use a copy plugin.

### 5. Load in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### 6. Configure
1. Click the extension icon → **Settings (⚙)**
2. Paste your **Anthropic API key** (get one at console.anthropic.com)
3. Set your preferred **digest hour** (default: 8am)
4. Save

### 7. Connect your Obsidian vault
1. Click the extension icon
2. Click **"Connect vault"**
3. Pick your Obsidian vault folder in the file picker
4. Grant read/write permission

---

## Slash Commands

| Command | Usage | Description |
|---|---|---|
| `/context` | `/context` | Summarize your current life/work state |
| `/trace` | `/trace <topic>` | Show how an idea evolved across your vault |
| `/connect` | `/connect <A> and <B>` | Find hidden connections between two domains |
| `/ideas` | `/ideas` | Generate startup/project ideas from vault patterns |
| `/graduate` | `/graduate <note name>` | Promote raw note → polished asset in `_assets/` |
| `/delegate` | `/delegate <sentence>` | Create execution plan in `_agents/` |

---

## Agent Rules
- Agents **only write** to `_agents/`, `_digests/`, `_assets/` folders
- Human notes are **read-only** for agents
- Vault explorer (Side Panel → Vault tab) lets you search all notes

## Daily Digest
- Auto-generated at your configured hour via `chrome.alarms`
- Covers: new notes (last 24h), orphaned notes, emerging themes, one insight
- Saved to `_digests/YYYY-MM-DD.md` in your vault
- View in popup → **Digest** tab or Side Panel → **Digest** tab

## Architecture
```
src/
├── lib/
│   ├── vault.js    — File System Access API + markdown parsing
│   ├── index.js    — TF-IDF search + link graph
│   ├── claude.js   — Anthropic API client
│   └── agents.js   — Slash command handlers
├── components/     — Shared React components
├── popup/          — 400×500 popup UI
├── sidepanel/      — Full-height side panel
└── background/     — Service worker (alarms + orchestration)
```
