'use client';

const STR = {
  en: { title: 'Application Error', defaultMsg: 'An unexpected error occurred.', tryAgain: 'Try Again', home: 'Home' },
  fr: { title: 'Erreur de l\'application', defaultMsg: 'Une erreur inattendue s\'est produite.', tryAgain: 'Réessayer', home: 'Accueil' },
} as const;

function readLocaleCookie(): 'en' | 'fr' {
  if (typeof document === 'undefined') return 'fr';
  const m = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(en|fr)/);
  return m ? (m[1] as 'en' | 'fr') : 'fr';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = readLocaleCookie();
  const s = STR[lang];
  return (
    <html lang={lang}>
      <body style={{ backgroundColor: '#0a0a0a', margin: 0 }}>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px', padding: '0 16px' }}>
            <h2 style={{ color: '#b33e3e', fontSize: '18px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {s.title}
            </h2>
            <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
              {error?.message || s.defaultMsg}
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
                {s.tryAgain}
              </button>
              <a
                href="/"
                style={{
                  padding: '8px 20px', fontSize: '12px', textTransform: 'uppercase',
                  backgroundColor: '#141414', border: '1px solid #262626',
                  color: '#888', textDecoration: 'none', letterSpacing: '0.1em',
                }}
              >
                {s.home}
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
