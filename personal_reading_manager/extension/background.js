/**
 * Background Service Worker
 * Handles context menus, message passing, and storage operations.
 */

// ─── Setup context menus on install ───────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'saveHighlight',
    title: 'Save Highlight',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'savePage',
    title: 'Save Current Page to Reading List',
    contexts: ['page'],
  });
});

// ─── Context menu click handler ────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'saveHighlight') {
    // Ask content script for the surrounding context of the selection
    let context = '';
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: captureSelectionContext,
      });
      context = results?.[0]?.result ?? '';
    } catch (e) {
      console.warn('Could not capture context:', e.message);
    }

    await saveHighlight(tab, info.selectionText.trim(), context);

  } else if (info.menuItemId === 'savePage') {
    await savePage(tab);
  }
});

// ─── Message handler (from popup) ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'savePage') {
    savePage(msg.tab).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }
});

// ─── Core save functions ───────────────────────────────────────────────────────

async function saveHighlight(tab, text, context) {
  if (!text) return;
  const key = urlToKey(tab.url);

  try {
    const stored = await chrome.storage.sync.get(key);
    const article = stored[key] ?? buildArticleMeta(tab);

    article.highlights.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      context: context !== text ? context : '',
      savedAt: Date.now(),
    });

    await chrome.storage.sync.set({ [key]: article });
    showBadge(tab.id, '✓', '#22c55e');

  } catch (e) {
    const isQuota = e.message?.includes('QUOTA_BYTES');
    console.error('saveHighlight error:', e);
    showBadge(tab.id, isQuota ? 'FULL' : '!', '#ef4444');
  }
}

async function savePage(tab) {
  const key = urlToKey(tab.url);

  try {
    const stored = await chrome.storage.sync.get(key);
    const article = stored[key] ?? buildArticleMeta(tab);
    // Refresh title/favicon if article already exists
    article.title = tab.title || article.title;
    article.lastVisited = Date.now();
    await chrome.storage.sync.set({ [key]: article });

    if (tab.id) showBadge(tab.id, '✓', '#3b82f6');
  } catch (e) {
    console.error('savePage error:', e);
    if (tab.id) showBadge(tab.id, '!', '#ef4444');
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildArticleMeta(tab) {
  let favicon = '';
  try {
    favicon = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32`;
  } catch {}

  return {
    url: tab.url,
    title: tab.title || tab.url,
    favicon,
    savedAt: Date.now(),
    read: false,
    highlights: [],
  };
}

/** Generates a stable, short storage key from a URL. */
function urlToKey(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = Math.imul(31, hash) + url.charCodeAt(i) | 0;
  }
  return `art_${Math.abs(hash)}`;
}

/** Shows a temporary badge on the extension icon. */
function showBadge(tabId, text, color) {
  if (!tabId) return;
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }, 1800);
}

// ─── Injected into page via scripting.executeScript ───────────────────────────

/**
 * Captures the surrounding paragraph/block context for the current selection.
 * This function runs in the page context, NOT in the service worker.
 */
function captureSelectionContext() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return '';

  const range = selection.getRangeAt(0);
  let node = range.commonAncestorContainer;

  // Walk up the DOM to find a meaningful block-level container
  const blockTags = new Set(['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'BLOCKQUOTE', 'TD', 'PRE', 'H1', 'H2', 'H3', 'H4']);
  while (node && !blockTags.has(node.nodeName)) {
    node = node.parentElement;
  }

  const text = (node?.innerText ?? '').trim().replace(/\s+/g, ' ');
  return text.substring(0, 600); // cap at 600 chars to respect storage limits
}
