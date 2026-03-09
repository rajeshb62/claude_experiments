# Personal OS Hub — Todo

## Phase 1: Scaffold
- [ ] Create extension manifest (manifest.json)
- [ ] Setup package.json with React + Vite + Tailwind
- [ ] Create popup entry (popup.html + popup.jsx)
- [ ] Create sidepanel entry (sidepanel.html + sidepanel.jsx)
- [ ] Create background service worker (background.js)

## Phase 2: Vault Layer
- [ ] lib/vault.js — directory picker + recursive .md reader
- [ ] lib/index.js — link graph + TF-IDF search
- [ ] lib/compress.js — token compression / summarization

## Phase 3: Claude Integration
- [ ] lib/claude.js — API client with context compression
- [ ] lib/agents.js — slash command router + agent orchestrator

## Phase 4: Slash Commands
- [ ] /context command
- [ ] /trace command
- [ ] /connect command
- [ ] /ideas command
- [ ] /graduate command
- [ ] /delegate command

## Phase 5: Daily Digest
- [ ] chrome.alarms setup in background.js
- [ ] Digest generator (scans last 24h notes)
- [ ] Save digest to vault _digests/ folder

## Phase 6: UI
- [ ] CommandBar component
- [ ] OutputPanel component
- [ ] DigestViewer component
- [ ] VaultExplorer component (side panel)
- [ ] Settings page

## Phase 7: Polish
- [ ] Error handling + loading states
- [ ] Setup instructions (README.md)
- [ ] Build script
