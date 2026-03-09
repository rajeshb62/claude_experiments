// agents.js — Slash command router + agent orchestrator

import { callClaude, buildVaultSystemPrompt, compressContext } from './claude.js';
import { writeAgentFile } from './vault.js';

/**
 * Route a slash command to the appropriate agent.
 * @param {string} command — e.g. "/context", "/ideas"
 * @param {string} args — text after the command
 * @param {object} vault — { files, graph, index }
 * @param {FileSystemDirectoryHandle} vaultHandle
 */
export async function routeCommand(command, args, vault, vaultHandle) {
  const cmd = command.toLowerCase().trim();

  switch (cmd) {
    case '/context':   return runContext(vault);
    case '/trace':     return runTrace(args, vault);
    case '/connect':   return runConnect(args, vault);
    case '/ideas':     return runIdeas(vault);
    case '/graduate':  return runGraduate(args, vault, vaultHandle);
    case '/delegate':  return runDelegate(args, vault, vaultHandle);
    default:
      throw new Error(`Unknown command: ${command}. Try /context, /trace, /connect, /ideas, /graduate, /delegate`);
  }
}

// --- Agents ---

async function runContext({ files, index }) {
  const recent = index.docs
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10);

  const ctx = compressContext(recent);
  const system = buildVaultSystemPrompt(ctx,
    'Task: Summarize the user\'s current life and work state based on their most recent notes. Identify active projects, open loops, and current focus areas.');

  return callClaude(system,
    'What is my current context based on my recent notes? What am I working on and what needs attention?');
}

async function runTrace(topic, { files, index, graph }) {
  if (!topic) return 'Usage: /trace <topic or note name>';

  const results = index.search(topic, 8);
  const neighbors = index.neighborhood(topic, graph, 2);
  const relatedFiles = files.filter(f =>
    results.some(r => r.name === f.name) || neighbors.includes(f.name)
  );

  const ctx = compressContext(relatedFiles);
  const system = buildVaultSystemPrompt(ctx,
    `Task: Trace the evolution of the idea "${topic}" across the vault. Show how it has developed, changed, or connected over time.`);

  return callClaude(system,
    `Trace the evolution of "${topic}" through my notes. Show me the journey of this idea.`);
}

async function runConnect(args, { files, index }) {
  const parts = args.split(' and ').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return 'Usage: /connect <domain A> and <domain B>';

  const [a, b] = parts;
  const resultsA = index.search(a, 5);
  const resultsB = index.search(b, 5);
  const combined = [...resultsA, ...resultsB];
  const ctx = compressContext(combined);

  const system = buildVaultSystemPrompt(ctx,
    `Task: Find hidden connections between "${a}" and "${b}" in the user's vault. Bridge these domains with novel insights.`);

  return callClaude(system,
    `What are the hidden connections between "${a}" and "${b}" in my notes? How can these domains inform each other?`);
}

async function runIdeas({ files, index }) {
  const topNotes = index.docs
    .sort((a, b) => b.tokens.length - a.tokens.length)
    .slice(0, 15);

  const ctx = compressContext(topNotes);
  const system = buildVaultSystemPrompt(ctx,
    'Task: Generate 5 concrete startup or project ideas based on patterns, interests, and knowledge in this vault. Each idea should connect multiple domains the user cares about.');

  return callClaude(system,
    'Based on my vault, what are 5 startup or project ideas that align with my interests and knowledge? Be specific and reference my actual notes.');
}

async function runGraduate(noteName, { files }, vaultHandle) {
  if (!noteName) return 'Usage: /graduate <note name>';

  const note = files.find(f =>
    f.name.toLowerCase() === noteName.toLowerCase() ||
    f.path.toLowerCase().includes(noteName.toLowerCase())
  );
  if (!note) return `Note "${noteName}" not found in vault.`;

  const system = buildVaultSystemPrompt(note.content,
    `Task: Transform this raw note into a polished asset. Clean up the structure, add clear sections, improve prose, and make it publication-ready. Output as clean markdown.`);

  const polished = await callClaude(system,
    `Graduate this note to a polished asset:\n\n${note.content}`);

  const date = new Date().toISOString().split('T')[0];
  const filename = `_assets/${noteName.replace(/\s+/g, '-')}-${date}.md`;
  await writeAgentFile(vaultHandle, filename, polished);

  return `Graduated! Saved polished version to: ${filename}\n\n---\n${polished.slice(0, 500)}...`;
}

async function runDelegate(sentence, { files, index }, vaultHandle) {
  if (!sentence) return 'Usage: /delegate <sentence describing the task>';

  const relevant = index.search(sentence, 5);
  const ctx = compressContext(relevant);

  const system = buildVaultSystemPrompt(ctx,
    'Task: Create a detailed execution plan for the delegated task. Break it into specific, actionable steps. Identify resources, blockers, and success criteria. Format as a markdown checklist.');

  const plan = await callClaude(system,
    `Create an execution plan for: "${sentence}"`);

  const date = new Date().toISOString().split('T')[0];
  const slug = sentence.slice(0, 30).replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
  const filename = `_agents/${date}-${slug}.md`;
  await writeAgentFile(vaultHandle, filename,
    `# Delegation: ${sentence}\nDate: ${date}\n\n${plan}`);

  return `Execution plan saved to: ${filename}\n\n---\n${plan}`;
}

/**
 * Generate daily digest from vault.
 */
export async function generateDailyDigest(vault, vaultHandle) {
  const { files, index } = vault;
  const recent = files.filter(f => f.mtime >= Date.now() - 24 * 60 * 60 * 1000);
  const orphaned = index.docs.filter(d => {
    const outgoing = (vault.graph[d.name] || []).length;
    return outgoing === 0 && !recent.some(r => r.name === d.name);
  }).slice(0, 5);

  const ctx = compressContext([...recent, ...orphaned]);
  const system = buildVaultSystemPrompt(ctx,
    'Task: Generate a concise morning digest. Cover: (1) What\'s new in the last 24h, (2) Orphaned notes that deserve attention, (3) Top patterns or themes emerging, (4) One insight or connection worth exploring today.');

  const digest = await callClaude(system,
    'Generate my daily Personal OS digest.');

  const date = new Date().toISOString().split('T')[0];
  const filename = `_digests/${date}.md`;
  await writeAgentFile(vaultHandle, filename,
    `# Daily Digest — ${date}\n\n${digest}`);

  return { digest, filename };
}
