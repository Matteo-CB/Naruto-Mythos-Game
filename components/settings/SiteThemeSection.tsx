'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { useSettingsStore, type SiteTheme } from '@/stores/settingsStore';
import { PowerIcon } from '@/components/icons/GameIcons';

const THEMES: Array<{ id: SiteTheme; labelKey: 'siteThemeKs' | 'siteThemeSs'; swatch: [string, string, string] }> = [
  { id: 'ks', labelKey: 'siteThemeKs', swatch: ['#0a0a0a', '#1a1a1a', '#c4a35a'] },
  { id: 'ss', labelKey: 'siteThemeSs', swatch: ['#f4f1ea', '#101010', '#ff8c1a'] },
];

export function SiteThemeSection() {
  const t = useTranslations('settings');
  const siteTheme = useSettingsStore((s) => s.siteTheme);
  const setSiteTheme = useSettingsStore((s) => s.setSiteTheme);

  const [draft, setDraft] = useState<SiteTheme>(siteTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(siteTheme); }, [siteTheme]);

  const dirty = draft !== siteTheme;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    await setSiteTheme(draft);
    setSaving(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  };

  return (
    <section
      className="w-full px-5 py-5"
      style={{ backgroundColor: 'var(--t-panel)', boxShadow: '0 12px 32px var(--t-shadow)' }}
    >
      <h2
        className="font-display mb-1 text-sm uppercase tracking-[0.18em]"
        style={{ color: 'var(--t-accent)' }}
      >
        {t('siteThemeTitle')}
      </h2>
      <p className="mb-4 text-[11px]" style={{ color: 'var(--t-muted)' }}>
        {t('siteThemeHint')}
      </p>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        {THEMES.map((theme) => {
          const active = draft === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setDraft(theme.id)}
              data-gp="true"
              aria-pressed={active}
              className="relative flex flex-1 items-center gap-3 px-4 py-3 text-left transition-all"
              style={{
                backgroundColor: active ? 'var(--t-accent-tint)' : 'var(--t-surface)',
                border: `1px solid ${active ? 'var(--t-accent)' : 'var(--t-border)'}`,
                color: active ? 'var(--t-accent)' : 'var(--t-text)',
              }}
            >
              <span className="flex shrink-0 items-center gap-1" aria-hidden>
                {theme.swatch.map((c) => (
                  <span
                    key={c}
                    style={{
                      width: 14,
                      height: 24,
                      backgroundColor: c,
                      border: '1px solid var(--t-border)',
                    }}
                  />
                ))}
              </span>
              <span className="font-display text-xs uppercase tracking-[0.14em]">
                {t(theme.labelKey)}
              </span>
              {active && (
                <motion.span
                  layoutId="site-theme-active"
                  className="ml-auto"
                  style={{ lineHeight: 0 }}
                >
                  <PowerIcon size={16} color="var(--t-accent)" />
                </motion.span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px]"
            style={{ color: 'var(--t-accent)' }}
          >
            {t('siteThemeSaved')}
          </motion.span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          data-gp="true"
          className="px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all"
          style={{
            backgroundColor: dirty ? 'var(--t-accent-tint)' : 'transparent',
            border: `1px solid ${dirty ? 'var(--t-accent)' : 'var(--t-border)'}`,
            color: dirty ? 'var(--t-accent)' : 'var(--t-dim)',
            cursor: dirty && !saving ? 'pointer' : 'default',
          }}
        >
          {saving ? t('siteThemeSaving') : t('siteThemeSave')}
        </button>
      </div>
    </section>
  );
}
