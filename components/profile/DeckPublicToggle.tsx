'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function DeckPublicToggle({ deckId, initialPublic }: { deckId: string; initialPublic: boolean }) {
  const t = useTranslations('profile');
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (busy) return;
    const next = !isPublic;
    setBusy(true);
    setIsPublic(next);
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) setIsPublic(!next);
    } catch {
      setIsPublic(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } }}
      disabled={busy}
      className="font-display text-[9px] uppercase tracking-widest px-2 py-1"
      style={{
        backgroundColor: isPublic ? 'var(--t-accent-glow)' : 'rgba(136,136,136,0.08)',
        color: isPublic ? 'var(--t-accent)' : 'var(--t-dim)',
        opacity: busy ? 0.5 : 1,
        cursor: busy ? 'default' : 'pointer',
      }}
      title={isPublic ? t('deckPublicHint') : t('deckPrivateHint')}
    >
      {isPublic ? t('deckPublic') : t('deckPrivate')}
    </button>
  );
}
