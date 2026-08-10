'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

interface Gif {
  id: string;
  preview: string;
  url: string;
  dims: number[];
}

export function TenorGifPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const t = useTranslations('feed');
  const locale = useLocale();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback((query: string) => {
    setLoading(true);
    fetch(`/api/tenor/search?q=${encodeURIComponent(query)}&locale=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((d) => setResults(Array.isArray(d.results) ? d.results : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [locale]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => search(q.trim()), q.trim() ? 350 : 0);
    return () => clearTimeout(id);
  }, [q, search]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: Z_APP_MODAL, backgroundColor: 'var(--t-overlay)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)', maxHeight: '80vh', boxShadow: '0 24px 60px var(--t-shadow)' }}
      >
        <div className="p-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--t-divider)' }}>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('gifSearch')}
            className="flex-1 min-w-0 px-3 py-2 text-sm focus:outline-none"
            style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
          />
          <button
            type="button"
            onClick={onClose}
            className="font-display text-[11px] uppercase tracking-widest px-3 py-2"
            style={{ backgroundColor: 'color-mix(in srgb, var(--t-muted) 8%, transparent)', color: 'var(--t-muted)' }}
          >
            {t('close')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2" style={{ minHeight: 200 }}>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-xs" style={{ color: 'var(--t-dim)' }}>{t('loading')}</div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-xs" style={{ color: 'var(--t-dim)' }}>{t('noGifs')}</div>
          ) : (
            <div className="columns-2 sm:columns-3 gap-2">
              {results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onSelect(g.url)}
                  className="mb-2 block w-full overflow-hidden"
                  style={{ backgroundColor: 'var(--t-surface-2)', cursor: 'pointer', lineHeight: 0 }}
                >
                  {}
                  <img src={g.preview} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-2 text-right" style={{ borderTop: '1px solid #1c1c20' }}>
          <span className="font-display text-[9px] uppercase tracking-[0.28em]" style={{ color: '#55555c' }}>{t('viaTenor')}</span>
        </div>
      </motion.div>
    </div>
  );
}
