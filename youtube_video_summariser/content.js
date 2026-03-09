// content.js — Injected on youtube.com/watch pages
//
// Two responsibilities:
//  1. Proxy authenticated fetch requests from the background service worker.
//     Content scripts use the browser's cookie store, so YouTube session
//     cookies are included automatically. The background service worker has
//     no cookie access and gets empty responses for signed timedtext URLs.
//  2. Detect YouTube SPA navigation and notify the background.

(function () {
  // ── Authenticated fetch proxy ───────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'fetchText') {
      fetch(message.url, { credentials: 'include' })
        .then(async res => {
          const text = await res.text();
          sendResponse({ ok: res.ok, status: res.status, text });
        })
        .catch(e => sendResponse({ ok: false, status: 0, text: '', error: e.message }));
      return true; // keep message channel open for async response
    }
  });

  // ── SPA navigation detection ────────────────────────────────────────────────
  function getVideoId() {
    try { return new URL(window.location.href).searchParams.get('v') || null; }
    catch { return null; }
  }

  let currentVideoId = getVideoId();
  const titleEl = document.querySelector('title');
  if (!titleEl) return;

  const observer = new MutationObserver(() => {
    const newVideoId = getVideoId();
    if (newVideoId && newVideoId !== currentVideoId) {
      currentVideoId = newVideoId;
      chrome.runtime.sendMessage({ action: 'videoChanged', videoId: newVideoId });
    }
  });
  observer.observe(titleEl, { subtree: true, characterData: true, childList: true });
})();
