/**
 * Popup script — handles all UI logic.
 * Reads/writes directly to chrome.storage.sync.
 */

const STORAGE_PREFIX = 'art_';
let allArticles = []; // cached articles for re-render on search

// ─── Storage helpers ───────────────────────────────────────────────────────────

/** Returns a consistent storage key for a URL. Must match background.js. */
function urlToKey(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = Math.imul(31, hash) + url.charCodeAt(i) | 0;
  }
  return `art_${Math.abs(hash)}`;
}

async function getAllArticles() {
  const all = await chrome.storage.sync.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(STORAGE_PREFIX))
    .map(([, v]) => v)
    .sort((a, b) => b.savedAt - a.savedAt);
}

async function saveArticle(article) {
  const key = urlToKey(article.url);
  await chrome.storage.sync.set({ [key]: article });
}

async function deleteArticle(url) {
  await chrome.storage.sync.remove(urlToKey(url));
}

// ─── Formatting ────────────────────────────────────────────────────────────────

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Render ────────────────────────────────────────────────────────────────────

function renderArticles(articles, query = '') {
  const list = document.getElementById('articleList');
  const empty = document.getElementById('emptyState');
  const q = query.trim().toLowerCase();

  const filtered = q
    ? articles.filter(a =>
        a.title.toLowerCase().includes(q) ||
        getDomain(a.url).includes(q) ||
        a.highlights.some(h => h.text.toLowerCase().includes(q))
      )
    : articles;

  const count = filtered.length;
  document.getElementById('articleCount').textContent =
    `${count} article${count !== 1 ? 's' : ''}`;

  // Clear existing cards (keep emptyState element)
  Array.from(list.querySelectorAll('.article-card')).forEach(el => el.remove());

  if (count === 0) {
    empty.style.display = 'flex';
    empty.querySelector('p').innerHTML = q
      ? `No results for <strong>"${escHtml(q)}"</strong>.`
      : 'No articles saved yet.<br/>Select text on any page and right-click → <strong>Save Highlight</strong>.';
    return;
  }

  empty.style.display = 'none';
  filtered.forEach(article => {
    const card = buildCard(article, q);
    list.appendChild(card);
  });
}

function buildCard(article, query = '') {
  const key = urlToKey(article.url);
  const domain = getDomain(article.url);
  const hlCount = article.highlights.length;

  const card = document.createElement('div');
  card.className = `article-card${article.read ? ' is-read' : ''}`;
  card.dataset.key = key;

  card.innerHTML = `
    <div class="card-header" data-key="${key}">
      <img class="favicon" src="${escHtml(article.favicon)}" alt="" onerror="this.style.display='none'" />
      <div class="article-info">
        <div class="article-title" title="${escHtml(article.title)}">${escHtml(article.title)}</div>
        <div class="article-meta">${escHtml(domain)} &middot; ${formatDate(article.savedAt)}</div>
      </div>
      <span class="badge ${hlCount === 0 ? 'zero' : ''}">${hlCount} hl</span>
      <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>

    <div class="card-actions">
      <button class="btn" data-action="open" data-url="${escHtml(article.url)}">↗ Open</button>
      <button class="btn ${article.read ? 'btn-success' : ''}" data-action="toggleRead" data-url="${escHtml(article.url)}">
        ${article.read ? '✓ Read' : 'Mark Read'}
      </button>
      <button class="btn btn-danger" data-action="deleteArticle" data-url="${escHtml(article.url)}">Delete</button>
    </div>

    <div class="highlights-panel" id="panel-${key}">
      ${hlCount === 0
        ? '<div class="no-highlights">No highlights for this article.</div>'
        : article.highlights.map((h, i) => buildHighlightItem(h, i, key, query)).join('')
      }
    </div>
  `;

  // Toggle panel open/close
  card.querySelector('.card-header').addEventListener('click', () => {
    const header = card.querySelector('.card-header');
    const panel = card.querySelector('.highlights-panel');
    header.classList.toggle('open');
    panel.classList.toggle('open');
  });

  // Action buttons
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleCardAction(btn.dataset.action, btn.dataset.url, btn.dataset.hlId);
    });
  });

  return card;
}

function buildHighlightItem(h, index, key, query = '') {
  const text = highlightQuery(escHtml(h.text), query);
  const ctxText = h.context && h.context !== h.text
    ? `<div class="highlight-context">${highlightQuery(escHtml(h.context.substring(0, 250)), query)}</div>`
    : '';

  return `
    <div class="highlight-item">
      <div class="highlight-text">&ldquo;${text}&rdquo;</div>
      ${ctxText}
      <div class="highlight-footer">
        <span class="highlight-date">${formatDate(h.savedAt)}</span>
        <button class="btn btn-xs btn-danger" data-action="deleteHighlight" data-url="" data-hl-id="${escHtml(h.id)}">×</button>
      </div>
    </div>
  `;
}

/** Wraps query matches in <mark> tags for visual highlighting. */
function highlightQuery(html, query) {
  if (!query) return html;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

// ─── Actions ───────────────────────────────────────────────────────────────────

async function handleCardAction(action, url, hlId) {
  switch (action) {
    case 'open':
      chrome.tabs.create({ url });
      break;

    case 'toggleRead': {
      const article = allArticles.find(a => a.url === url);
      if (!article) return;
      article.read = !article.read;
      await saveArticle(article);
      await refresh();
      break;
    }

    case 'deleteArticle': {
      if (!confirm(`Delete "${allArticles.find(a => a.url === url)?.title ?? url}"?`)) return;
      await deleteArticle(url);
      await refresh();
      break;
    }

    case 'deleteHighlight': {
      // Find which article contains this highlight ID
      const article = allArticles.find(a => a.highlights.some(h => h.id === hlId));
      if (!article) return;
      article.highlights = article.highlights.filter(h => h.id !== hlId);
      await saveArticle(article);
      await refresh();
      break;
    }
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

function exportMarkdown(articles) {
  let md = `# My Reading Highlights\n_Exported ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}_\n\n`;

  articles.forEach(a => {
    md += `## [${a.title}](${a.url})\n`;
    md += `**Domain:** ${getDomain(a.url)}  |  **Saved:** ${formatDate(a.savedAt)}  |  **Read:** ${a.read ? 'Yes' : 'No'}\n\n`;

    if (a.highlights.length > 0) {
      md += `### Highlights\n\n`;
      a.highlights.forEach(h => {
        md += `> ${h.text}\n\n`;
        if (h.context && h.context !== h.text) {
          md += `*Context:* ${h.context.substring(0, 300)}\n\n`;
        }
      });
    }

    md += `---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reading-highlights-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Refresh ───────────────────────────────────────────────────────────────────

async function refresh() {
  allArticles = await getAllArticles();
  const query = document.getElementById('search').value;
  renderArticles(allArticles, query);
}

// ─── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await refresh();

  // Search
  document.getElementById('search').addEventListener('input', e => {
    renderArticles(allArticles, e.target.value);
  });

  // Save current page
  document.getElementById('saveCurrentPage').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      alert('Cannot save this type of page.');
      return;
    }
    const btn = document.getElementById('saveCurrentPage');
    btn.textContent = 'Saving…';
    btn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ action: 'savePage', tab: { url: tab.url, title: tab.title, id: tab.id } });
      await refresh();
    } finally {
      btn.textContent = '+ Save Page';
      btn.disabled = false;
    }
  });

  // Export Markdown
  document.getElementById('exportAll').addEventListener('click', () => {
    if (allArticles.length === 0) { alert('Nothing to export yet.'); return; }
    exportMarkdown(allArticles);
  });

  // Clear all
  document.getElementById('clearAll').addEventListener('click', async () => {
    if (allArticles.length === 0) return;
    if (!confirm(`Delete all ${allArticles.length} saved article(s)? This cannot be undone.`)) return;
    const keys = allArticles.map(a => urlToKey(a.url));
    await chrome.storage.sync.remove(keys);
    await refresh();
  });
});
