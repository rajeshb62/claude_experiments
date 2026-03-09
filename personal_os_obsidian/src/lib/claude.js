// claude.js — Anthropic API client with token-efficient context

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 2048;
const CONTEXT_TOKEN_BUDGET = 6000; // chars ~= tokens * 4

/**
 * Get API key from chrome.storage.
 */
async function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get('api_key', r => resolve(r.api_key));
  });
}

/**
 * Core call to Claude API.
 */
export async function callClaude(systemPrompt, userMessage, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key set. Open Settings to add your Anthropic API key.');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model || MODEL,
      max_tokens: options.maxTokens || MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude API error: ${response.status} — ${err?.error?.message || 'unknown'}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Compress vault context to fit token budget.
 * Truncates content of each note to ~200 chars, keeps path + links.
 */
export function compressContext(files, tokenBudget = CONTEXT_TOKEN_BUDGET) {
  let budget = tokenBudget;
  const parts = [];

  for (const f of files) {
    if (budget <= 0) break;
    const snippet = f.content.slice(0, 300).replace(/\n+/g, ' ');
    const entry = `### ${f.name}\n${snippet}...\n`;
    parts.push(entry);
    budget -= entry.length;
  }

  return parts.join('\n');
}

/**
 * Build a system prompt with vault context.
 */
export function buildVaultSystemPrompt(contextNotes, extra = '') {
  return `You are the Personal OS Hub AI — an intelligent assistant that reads the user's Obsidian vault and surfaces insights, connections, and ideas.

Rules:
- You READ the vault; you do NOT overwrite human notes
- Output for agent actions goes to _agents/ or _digests/ folders only
- Be concise and specific; reference actual note names from the vault
- Think like a second brain: connect ideas across domains

Vault Context:
${contextNotes}

${extra}`.trim();
}
