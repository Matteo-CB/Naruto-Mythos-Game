'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useLocaleBcp47 } from '@/lib/i18n/useLocaleMeta';
import { PopupOverlay, PopupCornerFrame, PopupTitle, PopupActionButton } from '@/components/game/PopupPrimitives';
import { buildNoticeContent, type NoticeKind, type NoticePayload } from '@/lib/moderation/noticeContent';

interface PendingNotice {
  id: string;
  kind: NoticeKind;
  payload: NoticePayload;
  createdAt: number;
}

export function PlayerNoticeGate() {
  const t = useTranslations();
  const { data: session } = useSession();
  const bcp47 = useLocaleBcp47();
  const [nameResetNeeded, setNameResetNeeded] = useState(false);
  const [suspension, setSuspension] = useState<{ untilTs: number | null; reason: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [notices, setNotices] = useState<PendingNotice[]>([]);
  const [fetched, setFetched] = useState(false);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId || fetched) return;
    let cancelled = false;
    fetch('/api/notifications/pending')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setNameResetNeeded(data.usernameResetRequired === true);
        setSuspension(data.suspended === true ? { untilTs: data.suspendedUntilTs ?? null, reason: data.suspensionReason ?? '' } : null);
        setNotices(data.notifications ?? []);
        setFetched(true);
      })
      .catch(() => { if (!cancelled) setFetched(true); });
    return () => { cancelled = true; };
  }, [userId, fetched]);

  useEffect(() => {
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent).detail as PendingNotice | undefined;
      if (!detail?.id) return;
      setNotices((prev) => (prev.some((n) => n.id === detail.id) ? prev : [...prev, detail]));
    };
    window.addEventListener('notify:popup', onLive);
    return () => window.removeEventListener('notify:popup', onLive);
  }, []);

  const closeNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    fetch('/api/notifications/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {});
  }, []);

  const submitNewName = async () => {
    if (nameBusy || newName.trim().length === 0) return;
    setNameBusy(true);
    setNameError(null);
    try {
      const res = await fetch('/api/user/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newName.trim() }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setNameError(typeof data?.errorKey === 'string' ? data.errorKey : 'chat.sendError');
    } catch {
      setNameError('chat.sendError');
    }
    setNameBusy(false);
  };

  if (!userId) return null;

  if (suspension) {
    const suspBody = suspension.untilTs
      ? t('notify.sanction.suspensionTimed', {
          date: new Intl.DateTimeFormat(bcp47, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(suspension.untilTs)),
          reason: suspension.reason,
        })
      : t('notify.sanction.suspensionPermanent', { reason: suspension.reason });
    return (
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(179, 62, 62, 0.45)" maxWidth="460px">
          <PopupTitle accentColor="#b33e3e" size="md">{t('notify.suspendedTitle')}</PopupTitle>
          <p className="mb-5 text-center text-xs leading-relaxed" style={{ color: '#c8c8c8' }}>
            {suspBody}
          </p>
        </PopupCornerFrame>
      </PopupOverlay>
    );
  }

  if (nameResetNeeded) {
    return (
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(179, 62, 62, 0.45)" maxWidth="440px">
          <PopupTitle accentColor="#b33e3e" size="md">{t('notify.nameResetTitle')}</PopupTitle>
          <p className="mb-4 text-center text-xs leading-relaxed" style={{ color: '#c8c8c8' }}>
            {t('notify.nameResetBody')}
          </p>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 20))}
            onKeyDown={(e) => { if (e.key === 'Enter') submitNewName(); }}
            maxLength={20}
            className="w-full mb-2 px-3 py-2 text-[13px] outline-none text-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid #262626', color: '#e0e0e0' }}
          />
          {nameError && (
            <p className="text-center text-[11px] mb-3" style={{ color: '#b33e3e' }}>{t(nameError)}</p>
          )}
          <div className="flex justify-center">
            <PopupActionButton onClick={submitNewName} accentColor="#b33e3e" disabled={nameBusy || newName.trim().length < 3}>
              {t('notify.nameResetButton')}
            </PopupActionButton>
          </div>
        </PopupCornerFrame>
      </PopupOverlay>
    );
  }

  const current = notices[0];
  if (!current) return null;

  const formatDate = (ts: number) =>
    new Intl.DateTimeFormat(bcp47, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
  const content = buildNoticeContent(current.kind, current.payload ?? {}, formatDate);
  if (!content) {
    closeNotice(current.id);
    return null;
  }
  const accentColor = content.accent === 'red' ? '#b33e3e' : '#c4a35a';

  return (
    <PopupOverlay>
      <PopupCornerFrame accentColor={content.accent === 'red' ? 'rgba(179, 62, 62, 0.45)' : 'rgba(196, 163, 90, 0.45)'} maxWidth="460px">
        <PopupTitle accentColor={accentColor} size="md">{t(content.titleKey)}</PopupTitle>
        <p className="mb-5 text-center text-xs leading-relaxed" style={{ color: '#c8c8c8' }}>
          {t(content.bodyKey, content.params)}
        </p>
        <div className="flex justify-center">
          <PopupActionButton onClick={() => closeNotice(current.id)} accentColor={accentColor}>
            {t('common.ok')}
          </PopupActionButton>
        </div>
      </PopupCornerFrame>
    </PopupOverlay>
  );
}
