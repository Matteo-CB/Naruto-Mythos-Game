'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PopupOverlay, PopupCornerFrame, PopupTitle, PopupActionButton, PopupDismissLink } from '@/components/game/PopupPrimitives';
import { REPORT_REASON_MIN, REPORT_REASON_MAX } from '@/lib/chat/constants';

export interface ReportableMessage {
  text: string;
  at: number;
}

export function ReportPlayerPopup({
  target,
  context,
  roomCode,
  attachedMessage,
  recentMessages,
  onClose,
}: {
  target: { userId: string; username: string };
  context: 'game_chat' | 'dm' | 'profile';
  roomCode?: string | null;
  attachedMessage?: ReportableMessage | null;
  recentMessages?: ReportableMessage[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState('');
  const [attached, setAttached] = useState<ReportableMessage | null>(attachedMessage ?? null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const reasonTooShort = reason.trim().length < REPORT_REASON_MIN;
  const selectable = (recentMessages ?? []).slice(-20).reverse();

  const handleSubmit = async () => {
    if (busy || reasonTooShort) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: target.userId,
          reason: reason.trim().slice(0, REPORT_REASON_MAX),
          context,
          roomCode: roomCode ?? undefined,
          attachedMessage: attached?.text,
          attachedMessageAt: attached?.at,
        }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorKey(typeof body?.errorKey === 'string' ? body.errorKey : 'chat.sendError');
      }
    } catch {
      setErrorKey('chat.sendError');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopupOverlay>
      <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.4)" maxWidth="480px">
        <PopupTitle accentColor="#c4a35a" size="md">
          {done ? t('report.sentTitle') : t('report.title', { player: target.username })}
        </PopupTitle>

        {done ? (
          <>
            <p className="text-center text-xs leading-relaxed mb-5" style={{ color: '#c8c8c8' }}>
              {t('report.sentBody')}
            </p>
            <div className="flex justify-center">
              <PopupActionButton onClick={onClose}>{t('common.ok')}</PopupActionButton>
            </div>
          </>
        ) : (
          <>
            <label className="block text-[10px] uppercase font-bold mb-1.5" style={{ color: '#888', letterSpacing: '0.18em' }}>
              {t('report.reasonLabel')}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REPORT_REASON_MAX))}
              placeholder={t('report.reasonPlaceholder')}
              rows={3}
              className="w-full mb-1 px-3 py-2 text-[12px] resize-none outline-none"
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid #262626',
                color: '#e0e0e0',
              }}
            />
            <div className="flex justify-between mb-3">
              <span className="text-[10px]" style={{ color: reasonTooShort ? '#b33e3e' : '#555' }}>
                {reasonTooShort ? t('report.reasonTooShort') : ''}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: '#555' }}>
                {reason.trim().length}/{REPORT_REASON_MAX}
              </span>
            </div>

            <label className="block text-[10px] uppercase font-bold mb-1.5" style={{ color: '#888', letterSpacing: '0.18em' }}>
              {t('report.attachLabel')}
            </label>
            {attached ? (
              <div className="flex items-start gap-2 mb-4 px-3 py-2" style={{ backgroundColor: 'rgba(196,163,90,0.06)' }}>
                <span className="flex-1 text-[11px] leading-snug" style={{ color: '#c8c8c8' }}>
                  {attached.text}
                </span>
                <button
                  onClick={() => setAttached(null)}
                  className="text-[10px] uppercase font-bold cursor-pointer shrink-0"
                  style={{ color: '#666', background: 'none', border: 'none' }}
                >
                  X
                </button>
              </div>
            ) : selectable.length > 0 ? (
              <div className="mb-4 max-h-28 overflow-y-auto" style={{ border: '1px solid #1e1e1e' }}>
                {selectable.map((m, i) => (
                  <button
                    key={`${m.at}-${i}`}
                    onClick={() => setAttached(m)}
                    className="block w-full text-left px-3 py-1.5 text-[11px] cursor-pointer"
                    style={{ color: '#999', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    {m.text}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] mb-4" style={{ color: '#555' }}>
                {t('report.attachNone')}
              </p>
            )}

            {errorKey && (
              <p className="text-center text-[11px] mb-3" style={{ color: '#b33e3e' }}>
                {t(errorKey)}
              </p>
            )}

            <div className="flex items-center justify-center gap-5">
              <PopupActionButton onClick={handleSubmit} disabled={busy || reasonTooShort}>
                {t('report.submit')}
              </PopupActionButton>
              <PopupDismissLink onClick={onClose}>
                {t('common.cancel')}
              </PopupDismissLink>
            </div>
          </>
        )}
      </PopupCornerFrame>
    </PopupOverlay>
  );
}
