import { useState, useEffect, useCallback } from 'react';
import CommandBar from '../components/CommandBar.jsx';
import OutputPanel from '../components/OutputPanel.jsx';
import VaultStatus from '../components/VaultStatus.jsx';
import DigestViewer from '../components/DigestViewer.jsx';
import Settings from '../components/Settings.jsx';
import { pickVault, getVaultHandle, readVault, buildLinkGraph } from '../lib/vault.js';
import { buildIndex } from '../lib/index.js';
import { routeCommand } from '../lib/agents.js';

const TABS = ['Commands', 'Digest', 'Vault', 'Settings'];

export default function SidePanelApp() {
  const [vault, setVault] = useState(null);
  const [vaultHandle, setVaultHandle] = useState(null);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState('Commands');

  useEffect(() => { loadVault(); }, []);

  async function loadVault(forceNew = false) {
    try {
      let handle = forceNew ? await pickVault() : await getVaultHandle();
      if (!handle) return;
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') await handle.requestPermission({ mode: 'readwrite' });
      setVaultHandle(handle);
      const files = await readVault(handle);
      const graph = buildLinkGraph(files);
      const index = buildIndex(files);
      setVault({ files, graph, index });
    } catch (e) {
      console.error(e);
    }
  }

  const handleCommand = useCallback(async (command, args) => {
    if (!vault) {
      setEntries(prev => [...prev, { command, args, error: 'No vault connected.' }]);
      return;
    }
    setIsLoading(true);
    try {
      const output = await routeCommand(command, args, vault, vaultHandle);
      setEntries(prev => [...prev, { command, args, output }]);
    } catch (e) {
      setEntries(prev => [...prev, { command, args, error: e.message }]);
    } finally {
      setIsLoading(false);
    }
  }, [vault, vaultHandle]);

  return (
    <div className="bg-gray-900 text-gray-100 flex flex-col h-screen">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <span className="text-purple-400 font-bold">Personal OS Hub</span>
        </div>
        <VaultStatus
          vaultLoaded={!!vault}
          fileCount={vault?.files.length || 0}
          onPickVault={() => loadVault(true)}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs py-2 transition-colors ${
              tab === t ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden p-4">
        {tab === 'Commands' && (
          <div className="flex flex-col h-full gap-3">
            <CommandBar onSubmit={handleCommand} isLoading={isLoading} />
            <div className="flex-1 overflow-y-auto">
              <OutputPanel entries={entries} isLoading={isLoading} />
            </div>
          </div>
        )}
        {tab === 'Digest' && <DigestViewer />}
        {tab === 'Vault' && <VaultExplorer vault={vault} />}
        {tab === 'Settings' && <Settings onClose={() => setTab('Commands')} />}
      </div>
    </div>
  );
}

function VaultExplorer({ vault }) {
  const [query, setQuery] = useState('');
  const results = query && vault ? vault.index.search(query, 10) : vault?.index.docs.slice(0, 20) || [];

  return (
    <div className="flex flex-col h-full gap-3">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search vault..."
        className="bg-gray-800 text-gray-100 rounded px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-purple-500"
      />
      <div className="flex-1 overflow-y-auto space-y-1">
        {results.map((f, i) => (
          <div key={i} className="bg-gray-800 rounded px-3 py-2 text-sm">
            <div className="text-purple-300 font-medium">{f.name}</div>
            <div className="text-gray-500 text-xs truncate">{f.path}</div>
          </div>
        ))}
        {!vault && (
          <div className="text-gray-500 text-sm text-center py-8">Connect a vault to explore notes.</div>
        )}
      </div>
    </div>
  );
}
