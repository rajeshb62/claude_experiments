// index.js — TF-IDF search + link graph traversal

/**
 * Build a searchable index from vault files.
 * Returns an index object with search() method.
 */
export function buildIndex(files) {
  const docs = files.map(f => ({
    name: f.name,
    path: f.path,
    tokens: tokenize(f.content),
    content: f.content,
    mtime: f.mtime,
  }));

  const idf = computeIDF(docs);

  return {
    docs,
    idf,

    /**
     * Search for query terms. Returns top N results with score.
     */
    search(query, topN = 5) {
      const qTokens = tokenize(query);
      const scores = docs.map(doc => ({
        ...doc,
        score: tfIdfScore(doc.tokens, qTokens, idf),
      }));
      return scores
        .filter(d => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
    },

    /**
     * Find notes by date range (for /trace).
     */
    byDateRange(startMs, endMs) {
      return docs.filter(d => d.mtime >= startMs && d.mtime <= endMs);
    },

    /**
     * Get notes that link to or from a given note name.
     */
    neighborhood(noteName, graph, depth = 1) {
      const visited = new Set([noteName]);
      const queue = [noteName];
      for (let i = 0; i < depth; i++) {
        const next = [];
        for (const n of queue) {
          const links = graph[n] || [];
          for (const l of links) {
            if (!visited.has(l)) {
              visited.add(l);
              next.push(l);
            }
          }
        }
        queue.push(...next);
      }
      visited.delete(noteName);
      return [...visited];
    },
  };
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function computeIDF(docs) {
  const df = {};
  for (const doc of docs) {
    const unique = new Set(doc.tokens);
    for (const t of unique) {
      df[t] = (df[t] || 0) + 1;
    }
  }
  const N = docs.length;
  const idf = {};
  for (const [t, count] of Object.entries(df)) {
    idf[t] = Math.log((N + 1) / (count + 1)) + 1;
  }
  return idf;
}

function tfIdfScore(docTokens, queryTokens, idf) {
  const tf = {};
  for (const t of docTokens) tf[t] = (tf[t] || 0) + 1;
  let score = 0;
  for (const qt of queryTokens) {
    if (tf[qt]) score += (tf[qt] / docTokens.length) * (idf[qt] || 1);
  }
  return score;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'are', 'was',
  'have', 'has', 'not', 'but', 'from', 'they', 'will', 'been',
  'its', 'can', 'all', 'one', 'you', 'your', 'our',
]);
