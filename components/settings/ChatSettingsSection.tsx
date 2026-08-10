'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSettingsStore, type ChatVisibilitySetting } from '@/stores/settingsStore';
import { useLocaleBcp47 } from '@/lib/i18n/useLocaleMeta';

interface BlockedEntry {
  userId: string;
  username: string;
  blockedAt: string;
}

const VISIBILITY_OPTIONS: ChatVisibilitySetting[] = ['everyone', 'friends', 'off'];

export function ChatSettingsSection() {
  const t = useTranslations('settings');
  const { chatVisibility, setChatVisibility, isLoaded } = useSettingsStore();
  const bcp47 = useLocaleBcp47();
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [blockedLoaded, setBlockedLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/social/block')
      .then((res) => (res.ok ? res.json() : { blocked: [] }))
      .then((data) => {
        if (!cancelled) {
          setBlocked(data.blocked ?? []);
          setBlockedLoaded(true);
        }
      })
      .catch(() => { if (!cancelled) setBlockedLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const unblock = async (userId: string) => {
    if (busyId) return;
    setBusyId(userId);
    try {
      const res = await fetch(`/api/social/block/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      if (res.ok) {
        setBlocked((prev) => prev.filter((b) => b.userId !== userId));
      }
    } catch { }
    setBusyId(null);
  };

  return (
    <div
      className="mt-4 flex flex-col gap-4 p-5"
      style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}
    >
      <span className="text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
        {t('chatSection')}
      </span>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--t-muted)' }}>
          {t('chatVisibilityLabel')}
        </span>
        <div className="flex flex-wrap gap-2">
          {VISIBILITY_OPTIONS.map((opt) => {
            const active = chatVisibility === opt;
            return (
              <button
                key={opt}
                type="button"
                disabled={!isLoaded}
                onClick={() => setChatVisibility(opt)}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
                style={{
                  backgroundColor: active ? 'var(--t-accent)' : 'rgba(255,255,255,0.03)',
                  color: active ? 'var(--t-bg)' : 'var(--t-muted)',
                  border: 'none',
                  opacity: isLoaded ? 1 : 0.5,
                }}
              >
                {t(`chatVisibility.${opt}`)}
              </button>
            );
          })}
        </div>
        <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
          {t('chatVisibilityHint')}
        </p>
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--t-surface-2)' }} />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--t-muted)' }}>
          {t('blockedPlayers')}
        </span>
        {!blockedLoaded ? (
          <p className="text-xs" style={{ color: 'var(--t-dim)' }}>...</p>
        ) : blocked.length === 0 ? (
          <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
            {t('blockedEmpty')}
          </p>
        ) : (
          <div className="flex flex-col">
            {blocked.map((b) => (
              <div
                key={b.userId}
                className="flex items-center justify-between gap-3 py-2"
                style={{ borderBottom: '1px solid var(--t-divider)' }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] truncate" style={{ color: 'var(--t-text)' }}>
                    {b.username}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>
                    {new Intl.DateTimeFormat(bcp47, { dateStyle: 'medium' }).format(new Date(b.blockedAt))}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busyId === b.userId}
                  onClick={() => unblock(b.userId)}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 shrink-0"
                  style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)', border: 'none' }}
                >
                  {t('unblock')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
