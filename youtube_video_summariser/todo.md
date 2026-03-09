# YouTube Video Summarizer — Task List

## Phase 1: Project Scaffold

- [ ] Initialize project directory structure
- [ ] Create `package.json` with React, Vite, and plugin dependencies
- [ ] Create `vite.config.js` for multi-entry Chrome extension build
- [ ] Create `manifest.json` (Manifest V3)
- [ ] Create placeholder icon files (16/48/128px)
- [ ] Create `popup.html` shell
- [ ] Create `src/main.jsx` (React entry point)
- [ ] Create `src/App.jsx` (skeleton component)
- [ ] Create `src/styles.css` (CSS variables, base styles)
- [ ] Create `content.js` (skeleton)
- [ ] Create `background.js` (skeleton)

## Phase 2: Content Script — Video Detection

- [ ] Match YouTube video URL pattern (`youtube.com/watch?v=`)
- [ ] Extract `videoId` from `window.location.href`
- [ ] Send `{ action: "summarize", videoId }` message to background
- [ ] Handle navigation changes (YouTube is a SPA — listen for URL changes)

## Phase 3: Background — Transcript Extraction

- [ ] On extension install, set up `chrome.storage.local` schema for API keys
- [ ] Read `claudeApiKey` and `youtubeApiKey` from storage
- [ ] Fetch captions list: `GET https://www.googleapis.com/youtube/v3/captions?videoId=ID&key=KEY`
- [ ] Select preferred caption track (English default, fallback to first available)
- [ ] Download caption track content (XML/VTT)
- [ ] Parse caption XML/VTT into `[{ text, start, duration }]` array
- [ ] Flatten to plain transcript string with optional timestamp prefixes

## Phase 4: Background — Claude Summarization

- [ ] Build summarization prompt using `prompt-template.md` template
- [ ] Call Claude API (`POST https://api.anthropic.com/v1/messages`) with transcript
- [ ] Parse Claude JSON response into `{ points: [{ timestamp, text }] }`
- [ ] Return result to popup via `chrome.runtime.sendMessage` response

## Phase 5: Popup UI (React)

- [ ] Settings view: input fields for Claude API key and YouTube API key, save to `chrome.storage.local`
- [ ] Main view: summary display with loading skeleton
- [ ] Length selector dropdown (Short / Medium / Long)
- [ ] "Summarize" button — triggers message to background
- [ ] Display summary as numbered list with timestamps
- [ ] Copy to clipboard button (uses `navigator.clipboard.writeText`)
- [ ] Theme toggle button (dark/light), persist preference to `chrome.storage.local`
- [ ] Apply `prefers-color-scheme` as default on first load
- [ ] Saved summary: on popup open, check `chrome.storage.local` for existing summary for current videoId

## Phase 6: Error Handling & Polish

- [ ] Detect non-YouTube-video pages and show appropriate message
- [ ] Handle missing API keys gracefully (redirect to settings)
- [ ] Handle no-captions-available error
- [ ] Handle YouTube API / Claude API HTTP errors (show message + status)
- [ ] Add loading spinner/skeleton while fetching
- [ ] Add retry button on error
- [ ] Test on multiple YouTube videos (with/without captions)

## Phase 7: Build & Load

- [ ] Run `npm run build` — verify `dist/` output
- [ ] Load unpacked extension in Chrome (`chrome://extensions` > Load unpacked > `dist/`)
- [ ] Test end-to-end on a video with captions
- [ ] Test dark/light toggle persistence
- [ ] Test copy to clipboard
- [ ] Test saved summary on popup re-open
- [ ] Verify no console errors or permission warnings
