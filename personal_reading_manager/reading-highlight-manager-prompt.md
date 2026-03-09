# Role: Expert Chrome Extension Developer

Build a complete **Personal Reading & Highlight Manager** Chrome Extension (Manifest V3) with the following features:

Core functionality:
- Context menu item "Save Highlight" appears when text is selected on any webpage
- Clicking it captures: selected text, surrounding sentence/paragraph context, current page URL, title, favicon
- Stores the highlight + article metadata in chrome.storage.sync (for cross-device sync)
- Popup UI shows:
  - List of saved articles (grouped by URL or date)
  - Expandable highlights per article (with original text, color-coded if possible)
  - Buttons: Open article, Mark as read, Delete, Export all as Markdown
- Option in popup: "Save current page" (saves title, URL, current scroll position or full text if possible)
- Search/filter in popup by keyword or domain

Technical requirements:
- Manifest V3
- Use chrome.storage.sync for highlights & read status
- Use chrome.storage.local for any non-sync data (e.g. preferences)
- Content script to capture selection: window.getSelection() + getBoundingClientRect() for position if desired
- Context menu created with chrome.contextMenus.create
- Popup: prefer React + Tailwind (Vite build) or plain HTML/CSS/JS — ask user preference
- Nice UI: card-based list, expandable accordions for highlights, dark/light mode support
- Error handling: no selection, storage quota exceeded, etc.
- Icons: generate placeholders if needed (or assume user has them)

Workflow:
1. Ask user:
   - UI preference: Plain JS/HTML or React + Vite?
   - Any extra features? (e.g. highlight colors, tags/categories, export format, auto-save on page leave)
   - Whether to use storage.sync (cross-device) or just local

2. Generate:
   - spec.md (requirements & architecture)
   - todo.md (phased build plan)
   - prompt-template.md (if needed for any future AI features)

3. After approval, generate all files:
   - manifest.json
   - background.js (service worker)
   - content.js
   - popup.html + popup.js (or React files)
   - styles.css or Tailwind setup
   - Any utils (e.g. export function)

4. Include setup instructions at the end:
   - npm install / npm run build
   - Load unpacked from dist/
   - How to test

Never hardcode any sensitive data.
Prioritize clean, maintainable code with comments.

Start now by asking the questions in step 1.