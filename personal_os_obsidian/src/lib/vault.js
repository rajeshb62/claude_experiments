// vault.js — File System Access API + markdown parser

const STORAGE_KEY = 'vault_handle';
const CACHE_KEY = 'vault_cache';
const EXCLUDE_DIRS = ['_agents', '_digests', 'Templates', 'Archive', '.obsidian'];

/**
 * Prompt user to pick vault folder; persist handle.
 */
export async function pickVault() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  // Persist via IndexedDB (chrome.storage can't store FileSystemHandle)
  await saveHandleToIDB(handle);
  return handle;
}

export async function getVaultHandle() {
  return await loadHandleFromIDB();
}

/**
 * Recursively read all .md files from the vault.
 * Returns: { path, name, content, mtime }[]
 */
export async function readVault(handle, excludeDirs = EXCLUDE_DIRS) {
  const files = [];
  await traverseDir(handle, '', files, excludeDirs);
  return files;
}

async function traverseDir(dirHandle, basePath, results, excludeDirs) {
  for await (const [name, entry] of dirHandle.entries()) {
    const path = basePath ? `${basePath}/${name}` : name;
    if (entry.kind === 'directory') {
      if (!excludeDirs.includes(name)) {
        await traverseDir(entry, path, results, excludeDirs);
      }
    } else if (entry.kind === 'file' && name.endsWith('.md')) {
      const file = await entry.getFile();
      const content = await file.text();
      results.push({
        path,
        name: name.replace('.md', ''),
        content,
        mtime: file.lastModified,
      });
    }
  }
}

/**
 * Parse wikilinks from markdown content.
 * Returns array of linked note names.
 */
export function parseLinks(content) {
  const matches = content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g);
  return [...matches].map(m => m[1].trim());
}

/**
 * Parse frontmatter from markdown.
 * Returns { frontmatter: {}, body: string }
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const fm = {};
  match[1].split('\n').forEach(line => {
    const [k, ...v] = line.split(':');
    if (k && v.length) fm[k.trim()] = v.join(':').trim();
  });
  return { frontmatter: fm, body: match[2] };
}

/**
 * Build link graph from files.
 * Returns: { [noteName]: string[] }
 */
export function buildLinkGraph(files) {
  const graph = {};
  files.forEach(f => {
    graph[f.name] = parseLinks(f.content);
  });
  return graph;
}

/**
 * Get notes modified in last N hours.
 */
export function getRecentNotes(files, hours = 24) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return files.filter(f => f.mtime >= cutoff);
}

/**
 * Find orphaned notes (no incoming or outgoing links).
 */
export function findOrphanedNotes(files, graph) {
  const allLinked = new Set(Object.values(graph).flat());
  return files.filter(f => !allLinked.has(f.name) && graph[f.name]?.length === 0);
}

/**
 * Write a file to the vault (agent output folders only).
 */
export async function writeAgentFile(handle, relativePath, content) {
  const parts = relativePath.split('/');
  const topDir = parts[0];
  // Safety: only allow writing to agent-controlled folders
  if (!['_agents', '_digests', '_assets'].includes(topDir)) {
    throw new Error(`Agents cannot write to ${topDir}`);
  }
  let dir = handle;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

// --- IndexedDB helpers for FileSystemHandle persistence ---

async function saveHandleToIDB(handle) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('personal-os-hub', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'vault');
      tx.oncomplete = resolve;
      tx.onerror = reject;
    };
    req.onerror = reject;
  });
}

async function loadHandleFromIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('personal-os-hub', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('handles', 'readonly');
      const getReq = tx.objectStore('handles').get('vault');
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = reject;
    };
    req.onerror = reject;
  });
}
