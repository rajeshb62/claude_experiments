import { useState, useEffect, useCallback } from 'react';
import CommandBar from '../components/CommandBar.jsx';
import OutputPanel from '../components/OutputPanel.jsx';
import VaultStatus from '../components/VaultStatus.jsx';
import Settings from '../components/Settings.jsx';
import { pickVault, getVaultHandle, readVault, buildLinkGraph } from '../lib/vault.js';
import { buildIndex } from '../lib/index.js';
import { routeCommand } from '../lib/agents.js';

export default function App() {
  const [vault, setVault] = useState(null);
  const [vaultHandle, setVaultHandle] = useState(null);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState('commands');

  // Load vault on mount
  useEffect(() => {
    loadVault();
  }, []);

  async function loadVault(forceNew = false) {
    try {
      let handle = forceNew ? await pickVault() : await getVaultHandle();
      if (!handle) return;

      // Verify permission
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        await handle.requestPermission({ mode: 'readwrite' });
      }

      setVaultHandle(handle);
      const files = await readVault(handle);
      const graph = buildLinkGraph(files);
      const index = buildIndex(files);
      setVault({ files, graph, index });
    } catch (e) {
      console.error('Vault load error:', e);
    }
  }

  const handleCommand = useCallback(async (command, args) => {
    if (!vault) {
      setEntries(prev => [...prev, { command, args, error: 'No vault connected. Click "Connect vault" first.' }]);
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

  if (showSettings) {
    return (
      <div className="bg-gray-900 p-4 min-h-full">
        <Settings onClose={() => setShowSettings(false)} />
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-gray-100 flex flex-col h-full min-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-800">
        <div>
          <span className="text-purple-400 font-bold text-sm">Personal OS</span>
          <span className="text-gray-600 text-xs ml-2">Hub</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-gray-500 hover:text-gray-300 text-xs"
          title="Settings"
        >
          ⚙
        </button>
      </div>

      {/* Vault status */}
      <div className="px-4 py-1 border-b border-gray-800">
        <VaultStatus
          vaultLoaded={!!vault}
          fileCount={vault?.files.length || 0}
          onPickVault={() => loadVault(true)}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {['commands', 'digest'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs py-2 capitalize transition-colors ${
              tab === t ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-4 py-3">
        {tab === 'commands' ? (
          <div className="flex flex-col h-full gap-3">
            <CommandBar onSubmit={handleCommand} isLoading={isLoading} />
            <div className="flex-1 overflow-y-auto">
              <OutputPanel entries={entries} isLoading={isLoading} />
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto h-full">
            {/* Lazy import DigestViewer to keep popup size small */}
            <DigestViewerLazy />
          </div>
        )}
      </div>
    </div>
  );
}

// Lazy-loaded digest
function DigestViewerLazy() {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    import('../components/DigestViewer.jsx').then(m => setComp(() => m.default));
  }, []);
  if (!Comp) return <div className="text-gray-500 text-sm text-center py-4">Loading...</div>;
  return <Comp />;
}
