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

const INTRO_FEATURE_KEYS = ['features0', 'features1', 'features2', 'features3', 'features4', 'features5'] as const;

export function PlayerNoticeGate() {
  const t = useTranslations();
  const { data: session } = useSession();
  const bcp47 = useLocaleBcp47();
  const [introNeeded, setIntroNeeded] = useState(false);
  const [nameResetNeeded, setNameResetNeeded] = useState(false);
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
        setIntroNeeded(data.chatIntroSeen === false);
        setNameResetNeeded(data.usernameResetRequired === true);
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

  const closeIntro = useCallback(() => {
    setIntroNeeded(false);
    fetch('/api/user/chat-intro-seen', { method: 'POST' }).catch(() => {});
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

  if (introNeeded) {
    return (
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.45)" maxWidth="520px">
          <PopupTitle accentColor="#c4a35a" size="lg">{t('chatIntro.title')}</PopupTitle>
          <div className="mb-4 text-xs leading-relaxed" style={{ color: '#c8c8c8' }}>
            <p className="mb-3">{t('chatIntro.intro')}</p>
            <p className="mb-1.5 font-bold uppercase text-[10px] tracking-wider" style={{ color: '#888' }}>
              {t('chatIntro.featuresTitle')}
            </p>
            <ul className="mb-3 flex flex-col gap-1">
              {INTRO_FEATURE_KEYS.map((k) => (
                <li key={k} className="flex gap-2">
                  <span style={{ color: '#c4a35a' }}>&#x25AA;</span>
                  <span>{t(`chatIntro.${k}`)}</span>
                </li>
              ))}
            </ul>
            <p className="mb-2" style={{ color: '#e6d5ac' }}>{t('chatIntro.respect')}</p>
            <p style={{ color: '#888' }}>{t('chatIntro.outro')}</p>
          </div>
          <div className="flex justify-center">
            <PopupActionButton onClick={closeIntro}>{t('chatIntro.button')}</PopupActionButton>
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
