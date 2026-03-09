import { useState, useEffect, useCallback } from 'react';

const LENGTH_OPTIONS = [
  { value: 'short', label: 'Short', count: 3 },
  { value: 'medium', label: 'Medium', count: 5 },
  { value: 'long', label: 'Long', count: 7 },
];

// ─── Root Component ───────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('main'); // 'main' | 'settings'
  const [videoId, setVideoId] = useState(null);
  const [tabId, setTabId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [length, setLength] = useState('medium');
  const [theme, setTheme] = useState('light');
  const [cached, setCached] = useState(false);
  const [copied, setCopied] = useState(false);

  // Settings form state
  const [claudeKey, setClaudeKey] = useState('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [settingsError, setSettingsError] = useState(null);

  // ── Apply theme to document root ──────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Bootstrap: load preferences and current video ─────────────────────────
  useEffect(() => {
    chrome.storage.local.get(['theme', 'claudeApiKey', 'youtubeApiKey'], result => {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(result.theme || (systemDark ? 'dark' : 'light'));

      if (!result.claudeApiKey || !result.youtubeApiKey) {
        setView('settings');
        return;
      }

      loadCurrentVideo();
    });
  }, []);

  function loadCurrentVideo() {
    // Read the active tab URL directly in the popup — avoids a round-trip to
    // the background and works even if the content script hasn't loaded yet.
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.url) {
        setError('Open a YouTube video to use this extension.');
        return;
      }
      try {
        const url = new URL(tab.url);
        if (!url.hostname.includes('youtube.com') || url.pathname !== '/watch') {
          setError('Open a YouTube video to use this extension.');
          return;
        }
        const vid = url.searchParams.get('v');
        if (!vid) {
          setError('Open a YouTube video to use this extension.');
          return;
        }
        setTabId(tab.id);
        setVideoId(vid);
      } catch {
        setError('Could not read the current tab URL.');
      }
    });
  }

  // ── When videoId or length changes, check cache ───────────────────────────
  useEffect(() => {
    if (!videoId) return;
    setSummary(null);
    setError(null);
    setCached(false);

    const key = `summary_${videoId}_${length}`;
    chrome.storage.local.get(key, result => {
      if (result[key]) {
        setSummary(result[key]);
        setCached(true);
      }
    });
  }, [videoId, length]);

  // ── Load settings fields when switching to settings view ──────────────────
  useEffect(() => {
    if (view !== 'settings') return;
    chrome.storage.local.get(['claudeApiKey', 'youtubeApiKey'], result => {
      setClaudeKey(result.claudeApiKey || '');
      setYoutubeKey(result.youtubeApiKey || '');
    });
  }, [view]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleSummarize() {
    if (!videoId || loading) return;
    setLoading(true);
    setSummary(null);
    setError(null);

    // Pass tabId so the background can use chrome.scripting.executeScript (world: MAIN)
    // to read window.ytInitialPlayerResponse directly from the live page.
    chrome.runtime.sendMessage({ action: 'summarize', videoId, length, tabId }, response => {
      setLoading(false);
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message);
        return;
      }
      if (response?.error) {
        setError(response.error);
        return;
      }
      setSummary(response.summary);
      setCached(response.cached);
    });
  }

  function handleSaveSettings() {
    const c = claudeKey.trim();
    const y = youtubeKey.trim();
    if (!c || !y) {
      setSettingsError('Both API keys are required.');
      return;
    }
    setSettingsError(null);
    chrome.storage.local.set({ claudeApiKey: c, youtubeApiKey: y }, () => {
      setView('main');
      loadCurrentVideo();
    });
  }

  function handleCopy() {
    if (!summary) return;
    const text = summary.points
      .map(p => `${p.timestamp ? `[${p.timestamp}] ` : ''}${p.text}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleThemeToggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    chrome.storage.local.set({ theme: next });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (view === 'settings') {
    return (
      <SettingsView
        claudeKey={claudeKey}
        youtubeKey={youtubeKey}
        error={settingsError}
        onClaudeKeyChange={setClaudeKey}
        onYoutubeKeyChange={setYoutubeKey}
        onSave={handleSaveSettings}
        onBack={() => { setSettingsError(null); setView('main'); }}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />
    );
  }

  return (
    <MainView
      videoId={videoId}
      summary={summary}
      loading={loading}
      error={error}
      length={length}
      cached={cached}
      copied={copied}
      theme={theme}
      onLengthChange={setLength}
      onSummarize={handleSummarize}
      onCopy={handleCopy}
      onThemeToggle={handleThemeToggle}
      onOpenSettings={() => setView('settings')}
    />
  );
}

// ─── Settings View ────────────────────────────────────────────────────────────

function SettingsView({
  claudeKey, youtubeKey, error,
  onClaudeKeyChange, onYoutubeKeyChange,
  onSave, onBack, theme, onThemeToggle,
}) {
  return (
    <div className="popup">
      <header className="header">
        <div className="header-left">
          <button className="icon-btn" onClick={onBack} title="Back" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="header-title">Settings</span>
        </div>
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
      </header>

      <div className="content">
        <p className="settings-hint">
          API keys are stored locally in your browser and never shared.
        </p>

        <label className="field-label">Claude API Key</label>
        <input
          className="input"
          type="password"
          placeholder="sk-ant-..."
          value={claudeKey}
          onChange={e => onClaudeKeyChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        <label className="field-label" style={{ marginTop: '12px' }}>YouTube Data API Key</label>
        <input
          className="input"
          type="password"
          placeholder="AIza..."
          value={youtubeKey}
          onChange={e => onYoutubeKeyChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={onSave}>
          Save Keys
        </button>

        <p className="settings-hint" style={{ marginTop: '12px' }}>
          Get a Claude key at{' '}
          <span className="link-text">console.anthropic.com</span>
          {' '}· YouTube key at{' '}
          <span className="link-text">console.cloud.google.com</span>
        </p>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

function MainView({
  videoId, summary, loading, error,
  length, cached, copied, theme,
  onLengthChange, onSummarize, onCopy, onThemeToggle, onOpenSettings,
}) {
  const noVideo = !videoId;

  return (
    <div className="popup">
      <header className="header">
        <div className="header-left">
          <svg className="logo-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.27 8.27 0 0 0 4.84 1.55V6.79a4.85 4.85 0 0 1-1.07-.1z" />
          </svg>
          <span className="header-title">YT Summarizer</span>
        </div>
        <div className="header-right">
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
          <button className="icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="content">
        {noVideo ? (
          <EmptyState message="Open a YouTube video, then click this button to summarize it." />
        ) : (
          <>
            {/* Length selector */}
            <div className="length-selector">
              {LENGTH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`length-btn ${length === opt.value ? 'active' : ''}`}
                  onClick={() => onLengthChange(opt.value)}
                  disabled={loading}
                >
                  {opt.label}
                  <span className="length-count">{opt.count} pts</span>
                </button>
              ))}
            </div>

            {/* Primary action */}
            {!loading && (
              <button
                className="btn btn-primary summarize-btn"
                onClick={onSummarize}
                disabled={loading}
              >
                {summary ? 'Re-summarize' : 'Summarize Video'}
              </button>
            )}

            {/* Loading */}
            {loading && <LoadingSkeleton />}

            {/* Error */}
            {error && !loading && (
              <div className="error-card">
                <span className="error-icon">⚠</span>
                <span>{error}</span>
                <button className="retry-btn" onClick={onSummarize}>Retry</button>
              </div>
            )}

            {/* Summary */}
            {summary && !loading && (
              <SummaryCard
                summary={summary}
                cached={cached}
                copied={copied}
                onCopy={onCopy}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ summary, cached, copied, onCopy }) {
  return (
    <div className="summary-card">
      <div className="summary-header">
        <h2 className="summary-title">{summary.title}</h2>
        <div className="summary-meta">
          {cached && <span className="badge badge-cached">Cached</span>}
          <button
            className={`icon-btn copy-btn ${copied ? 'copied' : ''}`}
            onClick={onCopy}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
            aria-label="Copy summary"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <ol className="points-list">
        {summary.points.map(point => (
          <li key={point.index} className="point-item">
            {point.timestamp && (
              <span className="timestamp">{point.timestamp}</span>
            )}
            <span className="point-text">{point.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="skeleton-wrapper" aria-label="Loading summary…">
      <div className="skeleton skeleton-title" />
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-ts" />
          <div className="skeleton skeleton-line" style={{ width: `${70 + i * 8}%` }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="empty-icon">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
      <p className="empty-text">{message}</p>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  return (
    <button
      className="icon-btn"
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
