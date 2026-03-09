# Personal Reading & Highlight Manager — Chrome Extension

A Manifest V3 Chrome extension to save and manage highlights from any webpage, with cross-device sync via `chrome.storage.sync`.

## Features

- **Save Highlight** — right-click selected text on any page
- **Save Page** — save a page to your reading list (via context menu or popup)
- **Popup UI** — card list of saved articles with expandable highlights
- **Search** — filter by keyword or domain
- **Mark as Read** — track reading progress
- **Export Markdown** — download all highlights as a `.md` file
- **Dark/light mode** — follows system preference
- **Cross-device sync** — uses `chrome.storage.sync`

---

## Setup

### 1. Generate icons

Open `extension/create_icons.html` in your browser, click **Download All Icons**, then move the three downloaded PNGs into `extension/icons/`:

```
extension/icons/icon16.png
extension/icons/icon48.png
extension/icons/icon128.png
```

### 2. Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder

The extension icon will appear in your toolbar.

---

## Usage

| Action | How |
|---|---|
| Save a highlight | Select text → right-click → **Save Highlight** |
| Save current page | Right-click page → **Save Current Page** OR click extension icon → **+ Save Page** |
| View highlights | Click extension icon |
| Search | Type in the search bar |
| Mark as read | Open popup → **Mark Read** button on a card |
| Export | Open popup → **↓ Export MD** |
| Delete | Open popup → **Delete** button on a card or individual highlight |

---

## File structure

```
extension/
├── manifest.json        Chrome extension manifest (MV3)
├── background.js        Service worker: context menus, storage writes
├── content.js           Content script (hooks for future features)
├── popup.html           Extension popup
├── popup.js             Popup UI logic
├── popup.css            Styles (dark/light mode)
├── create_icons.html    In-browser icon generator (run once)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Storage

Uses `chrome.storage.sync` (100 KB quota, syncs across signed-in Chrome devices).
Each article is stored under a key `art_<hash>` containing:

```json
{
  "url": "https://...",
  "title": "Article Title",
  "favicon": "https://...",
  "savedAt": 1234567890,
  "read": false,
  "highlights": [
    { "id": "...", "text": "...", "context": "...", "savedAt": 1234567890 }
  ]
}
```

If you approach the storage quota, the extension badge will show `FULL` and log an error to the console.
