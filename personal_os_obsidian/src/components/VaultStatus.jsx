export default function VaultStatus({ vaultLoaded, fileCount, onPickVault }) {
  return (
    <div className="flex items-center justify-between text-xs text-gray-500 py-1">
      {vaultLoaded ? (
        <span className="flex items-center gap-1">
          <span className="text-green-400">●</span>
          {fileCount} notes indexed
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <span className="text-yellow-400">●</span>
          No vault connected
        </span>
      )}
      <button
        onClick={onPickVault}
        className="text-purple-400 hover:text-purple-300 underline"
      >
        {vaultLoaded ? 'Change vault' : 'Connect vault'}
      </button>
    </div>
  );
}
