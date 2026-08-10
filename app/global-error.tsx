'use client';

import { useEffect, useState } from 'react';

const STR = {
  en: { title: 'Application Error', defaultMsg: 'An unexpected error occurred.', tryAgain: 'Try Again', home: 'Home' },
  fr: { title: 'Erreur de l\'application', defaultMsg: 'Une erreur inattendue s\'est produite.', tryAgain: 'Réessayer', home: 'Accueil' },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<'en' | 'fr'>('fr');

  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(en|fr)/);
    if (m) setLang(m[1] as 'en' | 'fr');
  }, []);

  const s = STR[lang];
  return (
    <html lang={lang}>
      <body style={{ backgroundColor: 'var(--t-bg)', margin: 0 }}>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px', padding: '0 16px' }}>
            <h2 style={{ color: 'var(--t-danger)', fontSize: '18px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {s.title}
            </h2>
            <p style={{ color: 'var(--t-dim)', fontSize: '12px', marginTop: '8px' }}>
              {error?.message || s.defaultMsg}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
              <button
                onClick={reset}
                style={{
                  padding: '8px 20px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
                  backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)', cursor: 'pointer', letterSpacing: '0.1em',
                }}
              >
                {s.tryAgain}
              </button>
              <a
                href="/"
                style={{
                  padding: '8px 20px', fontSize: '12px', textTransform: 'uppercase',
                  backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)',
                  color: 'var(--t-muted)', textDecoration: 'none', letterSpacing: '0.1em',
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
