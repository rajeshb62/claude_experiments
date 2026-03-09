// background.js — Service Worker (Manifest V3)
// All API calls are made here; API keys never leave this context.

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getVideoId') {
    handleGetVideoId().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.action === 'summarize') {
    handleSummarize(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// ─── Get Current Video ID ────────────────────────────────────────────────────

async function handleGetVideoId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return { videoId: null };
  try {
    const url = new URL(tab.url);
    if (!url.hostname.includes('youtube.com') || url.pathname !== '/watch') {
      return { videoId: null };
    }
    return { videoId: url.searchParams.get('v') || null };
  } catch {
    return { videoId: null };
  }
}

// ─── Summarize Handler ───────────────────────────────────────────────────────

async function handleSummarize({ videoId, length, tabId }) {
  const { claudeApiKey, youtubeApiKey } = await chrome.storage.local.get([
    'claudeApiKey',
    'youtubeApiKey',
  ]);

  if (!claudeApiKey) throw new Error('Claude API key not set. Open Settings to add it.');
  if (!youtubeApiKey) throw new Error('YouTube API key not set. Open Settings to add it.');

  // Return cached result if available
  const cacheKey = `summary_${videoId}_${length}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) return { summary: cached[cacheKey], cached: true };

  const [videoTitle, transcript] = await Promise.all([
    fetchVideoTitle(videoId, youtubeApiKey),
    fetchTranscript(videoId, tabId),
  ]);

  const summary = await summarizeWithClaude(transcript, videoTitle, length, claudeApiKey);

  await chrome.storage.local.set({ [cacheKey]: summary });

  return { summary, cached: false };
}

// ─── YouTube Data API v3 — Video Title ──────────────────────────────────────

async function fetchVideoTitle(videoId, apiKey) {
  try {
    const url =
      `${YOUTUBE_API_BASE}/videos?part=snippet` +
      `&id=${encodeURIComponent(videoId)}` +
      `&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.snippet?.title || null;
  } catch {
    return null; // non-fatal — Claude will infer a title from the transcript
  }
}

// ─── Transcript Extraction ───────────────────────────────────────────────────

async function fetchTranscript(videoId, tabId) {
  let execError = `no tabId`;

  if (tabId) {
    let pageR = null;
    try {
      // ── Step A: get page data from MAIN world ─────────────────────────────────
      [{ result: pageR }] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          try {
            // ── 1. Transcript panel already open in DOM (zero network cost) ──────
            const segs = document.querySelectorAll('ytd-transcript-segment-renderer');
            if (segs.length > 5) {
              const lines = [];
              for (const seg of segs) {
                const ts = seg.querySelector('.segment-timestamp')?.textContent?.trim() ?? '';
                const txt = seg.querySelector('.segment-text')?.textContent?.trim() ?? '';
                if (txt) lines.push(ts ? `[${ts}] ${txt}` : txt);
              }
              if (lines.length > 5) return { rawTranscript: lines.join('\n') };
            }

            // ── 2. TextTrack cues loaded by the player (CC must be on) ───────────
            const video = document.querySelector('video');
            if (video) {
              for (let i = 0; i < video.textTracks.length; i++) {
                const t = video.textTracks[i];
                const cueList = t.cues;
                if (!cueList || cueList.length < 5) continue;
                const cues = [];
                for (let j = 0; j < cueList.length; j++) {
                  const c = cueList[j];
                  const text = (c.text || '').replace(/<[^>]+>/g, '').trim();
                  if (text) cues.push({ start: c.startTime, text });
                }
                if (cues.length >= 5) return { cues };
              }
            }

            const apiKey = window.ytcfg?.get?.('INNERTUBE_API_KEY') ?? null;
            // Build a complete context with visitorData so get_transcript accepts the request
            const rawCtx = window.ytcfg?.get?.('INNERTUBE_CONTEXT') ?? {};
            const visitorData = window.ytcfg?.get?.('VISITOR_DATA') ?? rawCtx?.client?.visitorData ?? null;
            const context = {
              ...rawCtx,
              client: {
                clientName: 'WEB',
                clientVersion: window.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION') ?? '2.20231121.09.00',
                hl: 'en',
                gl: 'US',
                originalUrl: window.location.href,
                visitorData: visitorData ?? undefined,
                ...(rawCtx?.client ?? {}),
              },
            };

            // Search ytInitialData for a key at any depth (capped to avoid huge traversal)
            function findKey(obj, key, depth = 0) {
              if (depth > 12 || !obj || typeof obj !== 'object') return undefined;
              if (key in obj) return obj[key];
              for (const v of Object.values(obj)) {
                if (v && typeof v === 'object') {
                  const r = findKey(v, key, depth + 1);
                  if (r !== undefined) return r;
                }
              }
              return undefined;
            }

            const data = window.ytInitialData;

            // Check for pre-loaded transcript segments in engagementPanels
            const panels = data?.engagementPanels ?? [];
            for (const panel of panels) {
              const r = panel?.engagementPanelSectionListRenderer;
              if (!r?.panelIdentifier?.includes('transcript')) continue;
              const segs = r?.content?.transcriptRenderer?.content
                ?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
              if (segs?.length) return { segments: segs, apiKey, context };
            }

            // Get the actual params YouTube uses for get_transcript
            const transcriptEndpoint = findKey(data, 'getTranscriptEndpoint');
            const transcriptParams = transcriptEndpoint?.params ?? null;

            // Player track info as fallback
            const player = document.getElementById('movie_player');
            const resp = player?.getPlayerResponse?.() ?? window.ytInitialPlayerResponse;
            const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            let trackInfo = null;
            if (tracks?.length) {
              const t = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
                || tracks.find(t => t.languageCode === 'en')
                || tracks.find(t => t.languageCode?.startsWith('en'))
                || tracks[0];
              trackInfo = { lang: t.languageCode, kind: t.kind ?? null, name: t.name?.simpleText ?? '', baseUrl: t.baseUrl ?? null };
            }

            return { apiKey, context, transcriptParams, trackInfo, hasTracks: !!tracks?.length };
          } catch (e) { return { error: e.message }; }
        },
      });

      // TextTrack cues already loaded by the player — fastest path
      if (pageR?.cues) return parseTextTrackCues(pageR.cues);

      // Pre-loaded transcript segments in ytInitialData
      if (pageR?.segments) {
        return parseGetTranscript({ actions: [{ updateEngagementPanelAction: { content: { transcriptRenderer: { content: { transcriptSearchPanelRenderer: { body: { transcriptSegmentListRenderer: { initialSegments: pageR.segments } } } } } } } }] });
      }

      if (!pageR?.hasTracks && !pageR?.transcriptParams) throw new Error('NO_CAPTIONS');

      // ── Step B: use InnerTube get_transcript API from ISOLATED world ──────────
      // This is the same endpoint YouTube's "Show Transcript" panel uses.
      // Running in isolated world gives us YouTube session cookies for auth.
      const [{ result: capR }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (videoId, apiKey, context, transcriptParams, trackInfo) => {
          function syncPost(url, body) {
            try {
              const x = new XMLHttpRequest();
              x.open('POST', url, false);
              x.withCredentials = true;
              x.setRequestHeader('Content-Type', 'application/json');
              x.send(JSON.stringify(body));
              return { ok: x.status >= 200 && x.status < 300, status: x.status, text: x.responseText };
            } catch (e) { return { ok: false, status: 0, text: '', err: e.message }; }
          }

          function syncGet(url) {
            try {
              const x = new XMLHttpRequest();
              x.open('GET', url, false);
              x.withCredentials = true;
              x.send(null);
              return { ok: x.status === 200, status: x.status, text: x.responseText };
            } catch (e) { return { ok: false, status: 0, text: '', err: e.message }; }
          }

          const key = apiKey || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
          const ctx = context || { client: { clientName: 'WEB', clientVersion: '2.20231121.09.00' } };
          const apiUrl = `https://www.youtube.com/youtubei/v1/get_transcript?key=${key}&prettyPrint=false`;

          // Use page-extracted params (exact params YouTube's UI sends)
          if (transcriptParams) {
            const r = syncPost(apiUrl, { context: ctx, params: transcriptParams });
            if (r.ok && r.text) return { text: r.text, via: 'get_transcript' };
          }

          // Build fallback protobuf params: field 1 (string) = videoId
          function buildParams(vid) {
            const id = vid.split('').map(c => c.charCodeAt(0));
            return btoa([0x0a, id.length, ...id].map(b => String.fromCharCode(b)).join(''));
          }
          const r = syncPost(apiUrl, { context: ctx, params: buildParams(videoId) });
          if (r.ok && r.text) return { text: r.text, via: 'get_transcript' };

          // Fallback: timedtext GET with cookies
          const lang = trackInfo?.lang || 'en';
          const kind = trackInfo?.kind;
          const name = trackInfo?.name || '';
          const qp = new URLSearchParams({ v: videoId, lang, fmt: 'json3' });
          if (kind === 'asr') qp.set('kind', 'asr');
          if (name) qp.set('name', name);
          const r2 = syncGet(`https://www.youtube.com/api/timedtext?${qp}`);
          if (r2.ok && r2.text) return { text: r2.text, via: 'timedtext' };

          return { error: `transcript=${r.status}:${r.text?.slice(0,60)},timedtext=${r2.status}` };
        },
        args: [videoId, pageR?.apiKey ?? null, pageR?.context ?? null, pageR?.transcriptParams ?? null, pageR?.trackInfo ?? null],
      });

      if (capR?.text) {
        if (capR.via === 'get_transcript') {
          return parseGetTranscript(JSON.parse(capR.text));
        }
        let data;
        try { data = JSON.parse(capR.text); }
        catch { throw new Error(`NOT_JSON:${capR.text.slice(0, 120)}`); }
        return parseJSON3(data);
      }
      execError = capR?.error || 'no text';
    } catch (e) {
      if (e.message === 'NO_CAPTIONS') throw e;
      execError = `executeScript threw: ${e.message}`;
    }

    // ── Step C: declarativeNetRequest — inject Referer, fetch from background SW
    // Background SW bypasses YouTube's page service worker; Referer satisfies
    // YouTube's server-side origin check on the timedtext endpoint.
    if (pageR?.trackInfo) {
      try {
        const text = await fetchTimedtextWithReferer(videoId, pageR.trackInfo);
        if (text) {
          let data;
          try { data = JSON.parse(text); }
          catch { throw new Error(`NOT_JSON:${text.slice(0, 120)}`); }
          return parseJSON3(data);
        }
      } catch (e) {
        if (e.message === 'NO_CAPTIONS') throw e;
        execError = `referer_fetch: ${e.message}`;
      }
    }
  }

  // ── Step 4: last-resort unauthenticated background SW timedtext ──────────────
  const trackList = await fetchTrackList(videoId);
  if (!trackList?.length) {
    throw new Error(`NO_CAPTIONS (exec:${execError})`);
  }

  const track =
    trackList.find(t => t.languageCode === 'en' && t.kind !== 'asr') ||
    trackList.find(t => t.languageCode === 'en') ||
    trackList.find(t => t.languageCode?.startsWith('en')) ||
    trackList[0];

  const params = new URLSearchParams({ v: videoId, lang: track.languageCode, fmt: 'json3' });
  if (track.kind === 'asr') params.set('kind', 'asr');
  if (track.name) params.set('name', track.name);

  const res = await fetch(`https://www.youtube.com/api/timedtext?${params}`);
  if (!res.ok) throw new Error(`timedtext HTTP ${res.status} (exec:${execError})`);

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`timedtext NOT_JSON: ${text.slice(0, 120)}`); }

  return parseJSON3(data);
}


// ─── TextTrack Cue Parser ─────────────────────────────────────────────────────

function parseTextTrackCues(cues) {
  const out = [];
  let lastText = '';
  for (const { start, text } of cues) {
    const norm = text.toLowerCase().replace(/\s+/g, ' ');
    if (norm === lastText) continue;
    lastText = norm;
    const secs = Math.floor(start);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const ts = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    out.push(`[${ts}] ${text}`);
  }
  if (!out.length) throw new Error('NO_CAPTIONS');
  return out.join('\n');
}

// ─── Timedtext Fetch with Injected Referer ────────────────────────────────────
// declarativeNetRequest lets the extension set headers (like Referer) that JS
// cannot set directly. The background SW fetch then carries that header to the
// YouTube timedtext server, which uses it for origin validation.

async function fetchTimedtextWithReferer(videoId, trackInfo) {
  const RULE_ID = 9001;
  const { lang, kind, name, baseUrl } = trackInfo;

  const params = new URLSearchParams({ v: videoId, lang: lang || 'en', fmt: 'json3' });
  if (kind === 'asr') params.set('kind', 'asr');
  if (name) params.set('name', name);
  const fallbackUrl = `https://www.youtube.com/api/timedtext?${params}`;

  const urlToFetch = baseUrl
    ? (() => { try { const u = new URL(baseUrl); u.searchParams.set('fmt', 'json3'); return u.toString(); } catch { return fallbackUrl; } })()
    : fallbackUrl;

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID],
      addRules: [{
        id: RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Referer', operation: 'set', value: `https://www.youtube.com/watch?v=${videoId}` },
            { header: 'Origin', operation: 'set', value: 'https://www.youtube.com' },
          ],
        },
        condition: {
          urlFilter: '||www.youtube.com/api/timedtext',
          resourceTypes: ['other', 'xmlhttprequest'],
        },
      }],
    });

    const res = await fetch(urlToFetch, { credentials: 'include' });
    const text = await res.text();
    return text || null;
  } finally {
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] }).catch(() => {});
  }
}

async function fetchTrackList(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&type=list`
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const tracks = [];
    const re = /<track[^>]+>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const el = m[0];
      const lang = el.match(/lang_code="([^"]+)"/)?.[1];
      const name = el.match(/\bname="([^"]*)"/)?.[1] ?? '';
      const kind = el.match(/\bkind="([^"]*)"/)?.[1] ?? null;
      if (lang) tracks.push({ languageCode: lang, kind, name });
    }
    return tracks.length ? tracks : null;
  } catch {
    return null;
  }
}

// ─── InnerTube get_transcript Response Parser ────────────────────────────────

function parseGetTranscript(data) {
  const segments =
    data?.actions?.[0]?.updateEngagementPanelAction?.content
      ?.transcriptRenderer?.content?.transcriptSearchPanelRenderer
      ?.body?.transcriptSegmentListRenderer?.initialSegments;

  if (!segments?.length) throw new Error('NO_CAPTIONS');

  const out = [];
  for (const s of segments) {
    const seg = s.transcriptSegmentRenderer;
    if (!seg) continue;
    const text = seg.snippet?.runs?.map(r => r.text ?? '').join('').replace(/\n/g, ' ').trim();
    if (!text) continue;
    const secs = Math.floor(parseInt(seg.startMs || '0', 10) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s2 = secs % 60;
    const ts = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`;
    out.push(`[${ts}] ${text}`);
  }

  if (!out.length) throw new Error('NO_CAPTIONS');
  return out.join('\n');
}

// ─── JSON3 Parser ─────────────────────────────────────────────────────────────
// YouTube's json3 format: { events: [{ tStartMs, segs: [{ utf8 }] }] }

function parseJSON3(data) {
  const events = data?.events ?? [];
  const entries = [];

  for (const ev of events) {
    if (!ev.segs?.length) continue;
    const text = ev.segs
      .map(s => s.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .trim();
    if (!text) continue;

    const secs = Math.floor((ev.tStartMs ?? 0) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const ts =
      h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    entries.push({ ts, text });
  }

  if (!entries.length) throw new Error('NO_CAPTIONS');

  // Deduplicate consecutive identical segments (rolling auto-caption windows)
  const out = [];
  let last = '';
  for (const e of entries) {
    const norm = e.text.toLowerCase().replace(/\s+/g, ' ');
    if (norm !== last) { out.push(e); last = norm; }
  }

  return out.map(e => `[${e.ts}] ${e.text}`).join('\n');
}

// ─── Claude API — Summarization ───────────────────────────────────────────────

async function summarizeWithClaude(transcript, videoTitle, length, apiKey) {
  const countMap = { short: 3, medium: 5, long: 7 };
  const count = countMap[length] ?? 5;

  const titleContext = videoTitle ? `Video title: "${videoTitle}"\n\n` : '';

  const systemPrompt =
    'You are an expert at summarizing YouTube video transcripts into clear, structured key points. ' +
    'Always respond with valid JSON only — no markdown, no extra text outside the JSON object.';

  const userPrompt =
    `${titleContext}` +
    `Summarize the following YouTube video transcript into exactly ${count} key points.\n\n` +
    `Rules:\n` +
    `- Each point must be a concise, self-contained insight or takeaway.\n` +
    `- Include the most relevant timestamp from the transcript for each point. Use null if unavailable.\n` +
    `- Do not fabricate information not present in the transcript.\n` +
    `- Keep each point under 2 sentences.\n\n` +
    `Respond with exactly this JSON (no additional text):\n` +
    `{\n` +
    `  "title": "${videoTitle || '<inferred topic, max 10 words>'}",\n` +
    `  "length": "${length}",\n` +
    `  "points": [\n` +
    `    { "index": 1, "timestamp": "MM:SS or null", "text": "..." }\n` +
    `  ]\n` +
    `}\n\n` +
    `Transcript:\n${transcript}`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Claude API error: ${msg}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Claude. Please try again.');

  // Parse JSON — with a lenient fallback in case Claude adds surrounding text
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    throw new Error('Claude returned an unexpected format. Please try again.');
  }
}
