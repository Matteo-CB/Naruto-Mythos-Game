'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PopupOverlay, PopupCornerFrame, PopupTitle, PopupDescription, PopupActionButton, PopupDismissLink } from '@/components/game/PopupPrimitives';

export function BlockPlayerPopup({
  target,
  onClose,
  onBlocked,
}: {
  target: { userId: string; username: string };
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const handleBlock = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/social/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.userId }),
      });
      if (!res.ok) throw new Error('block failed');
      setDone(true);
      onBlocked?.();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopupOverlay>
      <PopupCornerFrame accentColor="rgba(179, 62, 62, 0.4)" maxWidth="420px">
        <PopupTitle accentColor="#b33e3e" size="md">
          {done ? t('social.block.doneTitle') : t('social.block.confirmTitle', { player: target.username })}
        </PopupTitle>
        {!done && (
          <PopupDescription>
            {t('social.block.confirmBody')}
          </PopupDescription>
        )}
        {error && (
          <p className="text-center text-[11px] mb-3" style={{ color: '#b33e3e' }}>
            {t('chat.sendError')}
          </p>
        )}
        <div className="flex items-center justify-center gap-5">
          {done ? (
            <PopupActionButton onClick={onClose}>
              {t('common.ok')}
            </PopupActionButton>
          ) : (
            <>
              <PopupActionButton onClick={handleBlock} accentColor="#b33e3e" disabled={busy}>
                {t('social.block.confirm')}
              </PopupActionButton>
              <PopupDismissLink onClick={onClose}>
                {t('common.cancel')}
              </PopupDismissLink>
            </>
          )}
        </div>
      </PopupCornerFrame>
    </PopupOverlay>
  );
}
