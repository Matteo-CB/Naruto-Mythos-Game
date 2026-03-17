'use client';

import { useEffect, useState } from 'react';

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    console.error('[Game Error]', error);

    // Auto-retry immediately — game state lives in Zustand store (not in the crashed component tree).
    // reset() re-renders the component tree which will read from the intact store.
    if (retryCount < 3) {
      const timer = setTimeout(() => {
        setRetryCount((c) => c + 1);
        reset();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [error, reset, retryCount]);

  // Only show error UI if auto-retry failed 3 times
  if (retryCount < 3) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <p className="text-sm" style={{ color: '#888' }}>Recovering...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex flex-col items-center gap-4 max-w-md w-full text-center px-4">
        <div className="w-12 h-px" style={{ backgroundColor: 'rgba(179, 62, 62, 0.4)' }} />
        <h2 className="text-lg font-bold uppercase tracking-wider" style={{ color: '#b33e3e' }}>
          Game Error
        </h2>
        <p className="text-xs" style={{ color: '#666' }}>
          {error?.message || 'The game encountered an error.'}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { setRetryCount(0); reset(); }}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.1)',
              border: '1px solid rgba(196, 163, 90, 0.3)',
              color: '#c4a35a',
            }}
          >
            Retry
          </button>
          <a
            href="/"
            className="px-5 py-2 text-xs uppercase tracking-wider"
            style={{
              backgroundColor: '#141414',
              border: '1px solid #262626',
              color: '#888',
            }}
          >
            Home
          </a>
        </div>
        <div className="w-12 h-px mt-1" style={{ backgroundColor: 'rgba(179, 62, 62, 0.4)' }} />
      </div>
    </div>
  );
}
