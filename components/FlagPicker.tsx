'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { COUNTRIES } from '@/lib/data/countries';
import { CountryFlag } from './CountryFlag';

interface FlagPickerProps {
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
}

const ACCENT = '#c4a35a';

export function FlagPicker({ value, onChange, disabled }: FlagPickerProps) {
  const locale = useLocale();
  const t = useTranslations('flag');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const localized = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([locale], { type: 'region' }); } catch { /* ignore */ }
    return COUNTRIES.map((c) => {
      let name = c.name;
      try {
        const n = dn?.of(c.code.toUpperCase());
        if (n && n.toUpperCase() !== c.code.toUpperCase()) name = n;
      } catch { /* ignore */ }
      return { code: c.code, name };
    }).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localized;
    return localized.filter((c) => c.name.toLowerCase().includes(q) || c.code.includes(q));
  }, [localized, query]);

  const current = value ? localized.find((c) => c.code === value) : null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const rowStyle = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors';

  return (
    <div ref={ref} className="relative w-full" style={{ maxWidth: 340 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors"
        style={{
          backgroundColor: '#0e0e0e',
          border: `1px solid ${open ? `${ACCENT}66` : '#262626'}`,
          color: current ? '#e0e0e0' : '#666',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {current ? <CountryFlag code={current.code} size={20} /> : null}
          <span className="truncate">{current ? current.name : t('none')}</span>
        </span>
        <span
          aria-hidden
          style={{
            width: 6, height: 6, flexShrink: 0,
            borderRight: `1.5px solid ${ACCENT}`,
            borderBottom: `1.5px solid ${ACCENT}`,
            transform: open ? 'rotate(-135deg)' : 'rotate(45deg)',
            transition: 'transform 150ms ease',
            marginTop: open ? 3 : -2,
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden"
          style={{ backgroundColor: '#0e0e0e', border: '1px solid #262626', boxShadow: '0 12px 32px rgba(0,0,0,0.55)' }}
        >
          <div className="p-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full px-2.5 py-1.5 text-sm outline-none"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#e0e0e0' }}
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setQuery(''); }}
              className={rowStyle}
              style={{ color: !value ? ACCENT : '#888', backgroundColor: !value ? `${ACCENT}12` : 'transparent' }}
              onMouseEnter={(e) => { if (value) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={(e) => { if (value) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <span style={{ width: 20, height: 15, flexShrink: 0, border: '1px dashed #444', borderRadius: 2 }} />
              <span>{t('none')}</span>
            </button>
            {filtered.map((c) => {
              const selected = c.code === value;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onChange(c.code); setOpen(false); setQuery(''); }}
                  className={rowStyle}
                  style={{ color: selected ? ACCENT : '#ccc', backgroundColor: selected ? `${ACCENT}12` : 'transparent' }}
                  onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  <CountryFlag code={c.code} size={20} />
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs" style={{ color: '#555' }}>{t('noResults')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
