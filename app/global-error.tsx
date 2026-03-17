'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ backgroundColor: '#0a0a0a', margin: 0 }}>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px', padding: '0 16px' }}>
            <h2 style={{ color: '#b33e3e', fontSize: '18px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Application Error
            </h2>
            <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
              {error?.message || 'An unexpected error occurred.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
              <button
                onClick={reset}
                style={{
                  padding: '8px 20px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
                  backgroundColor: 'rgba(196, 163, 90, 0.1)', border: '1px solid rgba(196, 163, 90, 0.3)',
                  color: '#c4a35a', cursor: 'pointer', letterSpacing: '0.1em',
                }}
              >
                Try Again
              </button>
              <a
                href="/"
                style={{
                  padding: '8px 20px', fontSize: '12px', textTransform: 'uppercase',
                  backgroundColor: '#141414', border: '1px solid #262626',
                  color: '#888', textDecoration: 'none', letterSpacing: '0.1em',
                }}
              >
                Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
