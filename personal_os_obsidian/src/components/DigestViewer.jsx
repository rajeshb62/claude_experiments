import { useState, useEffect } from 'react';

export default function DigestViewer() {
  const [digest, setDigest] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['latest_digest', 'latest_digest_date'], r => {
      if (r.latest_digest) setDigest(r.latest_digest);
      if (r.latest_digest_date) {
        setDate(new Date(r.latest_digest_date).toLocaleDateString());
      }
    });
  }, []);

  if (!digest) {
    return (
      <div className="text-gray-500 text-sm text-center py-6">
        <div className="text-xl mb-2">🌅</div>
        <div>No digest yet.</div>
        <div className="text-xs mt-1 text-gray-600">Generated daily at your configured time.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">Digest for {date}</div>
      <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
        {digest}
      </div>
    </div>
  );
}
