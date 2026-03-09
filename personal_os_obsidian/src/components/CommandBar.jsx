import { useState } from 'react';

const COMMANDS = ['/context', '/trace', '/connect', '/ideas', '/graduate', '/delegate'];

export default function CommandBar({ onSubmit, isLoading }) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const handleChange = e => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      setSuggestions(COMMANDS.filter(c => c.startsWith(val.split(' ')[0])));
    } else {
      setSuggestions([]);
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const [cmd, ...rest] = input.trim().split(' ');
    onSubmit(cmd, rest.join(' '));
    setInput('');
    setSuggestions([]);
  };

  const handleSuggestionClick = cmd => {
    setInput(cmd + ' ');
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={handleChange}
          placeholder="/context, /ideas, /delegate <task>..."
          className="flex-1 bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-purple-500"
          autoFocus
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? '...' : 'Run'}
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden z-10">
          {suggestions.map(cmd => (
            <button
              key={cmd}
              onClick={() => handleSuggestionClick(cmd)}
              className="w-full text-left px-3 py-2 text-sm text-purple-400 hover:bg-gray-700 font-mono"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
