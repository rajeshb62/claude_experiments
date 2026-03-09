# YouTube Video Summarizer Chrome Extension — Specification

## Overview
A Chrome Extension (Manifest V3) that detects YouTube video pages, fetches the video transcript via the YouTube Data API v3, sends it to the Claude API for structured summarization, and displays the result in a React-based popup UI.

---

## Architecture

### Components

| Component | File | Responsibility |
|---|---|---|
| Manifest | `manifest.json` | Declares permissions, registers background worker, popup, and content scripts |
| Background Service Worker | `background.js` | Stores/retrieves API keys via `chrome.storage.local`, handles transcript fetch and Claude API calls |
| Content Script | `content.js` | Detects YouTube video page, extracts video ID from URL, messages the background worker |
| Popup (React) | `src/App.jsx` | UI: summary display, length selector, theme toggle, copy button, saved summaries |
| Popup Entry | `src/main.jsx` | React DOM mount point |
| Popup HTML | `popup.html` | Shell HTML loaded by Chrome for the popup |
| Styles | `src/styles.css` | CSS custom properties for light/dark theme, component styles |
| Build Config | `vite.config.js` | Vite config targeting Chrome extension output |

---

## Permissions

```json
["activeTab", "scripting", "storage", "tabs"]
```

- `activeTab` + `scripting`: Allow content script injection on the active tab.
- `storage`: `chrome.storage.local` for API keys and saved summaries.
- `tabs`: Read the current tab URL to detect YouTube video pages.

Host permissions: `https://www.googleapis.com/*`, `https://api.anthropic.com/*`

---

## Tech Stack

- **Framework**: React 18 (popup UI)
- **Bundler**: Vite with `vite-plugin-web-extension` (or manual multi-entry Vite config)
- **Language**: JavaScript ES6+, async/await
- **Styling**: Plain CSS with custom properties (no Tailwind dependency)
- **APIs**:
  - YouTube Data API v3 — captions/transcript endpoint
  - Anthropic Claude API (claude-sonnet-4-6) — summarization

---

## Features

### Core
- Detect active YouTube video page via content script + URL pattern matching
- Extract video ID from URL (`?v=VIDEO_ID`)
- Fetch captions list via YouTube Data API v3, then download the caption track
- Parse transcript (XML/VTT) into plain text with optional timestamps
- Send transcript to Claude API for summarization
- Display structured summary in popup

### Summary Options
| Length | Key Points |
|---|---|
| Short | 3 |
| Medium | 5 |
| Long | 7 |

Timestamps included in output when available in the transcript.

### Extra Features
- **Copy to clipboard**: One-click copy of the full summary text
- **Dark/light theme toggle**: Button toggle persisted to `chrome.storage.local`; respects `prefers-color-scheme` as default
- **Save summaries**: Each generated summary saved to `chrome.storage.local` keyed by video ID; accessible on re-open without re-fetching

---

## Data Flow

```
[YouTube Tab]
    |-- content.js detects video page
    |-- extracts videoId
    |-- chrome.runtime.sendMessage({ action: "summarize", videoId })
            |
    [background.js]
            |-- reads API keys from chrome.storage.local
            |-- fetches caption list from YouTube API
            |-- downloads caption track XML/VTT
            |-- parses transcript text + timestamps
            |-- calls Claude API with prompt + transcript
            |-- returns { summary, timestamps } to popup
            |
    [popup / App.jsx]
            |-- displays summary
            |-- allows copy, length change, theme toggle
            |-- saves result to chrome.storage.local
```

---

## Security Considerations

- API keys stored exclusively in `chrome.storage.local` — never hardcoded or exposed in content scripts
- Content script only reads the URL and sends a message; no direct API access
- All external API calls made from the background service worker (trusted context)
- No eval, no inline scripts

---

## Error States

| Scenario | Handling |
|---|---|
| Not on a YouTube video page | Popup shows "Navigate to a YouTube video first" |
| No captions available | Popup shows "No transcript available for this video" |
| Missing API key(s) | Popup shows settings prompt to enter keys |
| YouTube API error | Popup shows error message with status code |
| Claude API error | Popup shows error message, allows retry |
| Network offline | Popup shows generic network error |
