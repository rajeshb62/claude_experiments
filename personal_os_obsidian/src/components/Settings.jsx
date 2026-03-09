import { useState, useEffect } from 'react';

export default function Settings({ onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [digestHour, setDigestHour] = useState(8);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['api_key', 'digest_hour'], r => {
      if (r.api_key) setApiKey(r.api_key);
      if (r.digest_hour !== undefined) setDigestHour(r.digest_hour);
    });
  }, []);

  const save = () => {
    chrome.storage.local.set({ api_key: apiKey, digest_hour: digestHour }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Settings</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕ Close</button>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Anthropic API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full bg-gray-800 text-gray-100 rounded px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-purple-500"
        />
        <p className="text-xs text-gray-600 mt-1">Stored locally in chrome.storage. Never sent except to api.anthropic.com.</p>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Daily Digest Hour (0–23)</label>
        <input
          type="number"
          min={0}
          max={23}
          value={digestHour}
          onChange={e => setDigestHour(Number(e.target.value))}
          className="w-24 bg-gray-800 text-gray-100 rounded px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-purple-500"
        />
      </div>

      <button
        onClick={save}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
      >
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
