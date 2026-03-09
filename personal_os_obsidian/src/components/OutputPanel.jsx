export default function OutputPanel({ entries, isLoading }) {
  if (!entries.length && !isLoading) {
    return (
      <div className="text-gray-500 text-sm text-center py-8">
        <div className="text-2xl mb-2">⌘</div>
        <div>Type a slash command to begin</div>
        <div className="text-xs mt-2 text-gray-600">
          /context · /trace · /connect · /ideas · /graduate · /delegate
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto">
      {isLoading && (
        <div className="flex items-center gap-2 text-purple-400 text-sm">
          <span className="animate-pulse">●</span>
          <span>Thinking...</span>
        </div>
      )}
      {[...entries].reverse().map((entry, i) => (
        <div key={i} className="bg-gray-800 rounded-lg p-3 text-sm">
          <div className="text-purple-400 font-mono text-xs mb-2">
            {entry.command} {entry.args && <span className="text-gray-400">{entry.args}</span>}
          </div>
          {entry.error ? (
            <div className="text-red-400">{entry.error}</div>
          ) : (
            <div className="text-gray-200 whitespace-pre-wrap leading-relaxed">
              {entry.output}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
