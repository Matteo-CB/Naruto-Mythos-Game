'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import { useSession } from 'next-auth/react';
import { useGameScale } from './GameScaleContext';

const PRESET_MESSAGES = [
  { key: 'gg', label: 'GG', color: '#c4a35a' },
  { key: 'wp', label: 'Well Played', color: '#3e8b3e' },
  { key: 'gl', label: 'Good Luck', color: '#5A7ABB' },
  { key: 'thanks', label: 'Thanks', color: '#888' },
  { key: 'sorry', label: 'Sorry', color: '#b37e3e' },
  { key: 'nice', label: 'Nice Move', color: '#3e8b3e' },
  { key: 'oops', label: 'Oops', color: '#b33e3e' },
  { key: 'letsgo', label: "Let's Go", color: '#c4a35a' },
] as const;

const EMOTES = [
  { code: ':gg:', display: 'GG', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
  { code: ':wp:', display: 'WP', color: '#3e8b3e', bg: 'rgba(62,139,62,0.15)' },
  { code: ':gl:', display: 'GL', color: '#5A7ABB', bg: 'rgba(90,122,187,0.15)' },
  { code: ':hf:', display: 'HF', color: '#5A7ABB', bg: 'rgba(90,122,187,0.15)' },
  { code: ':nice:', display: 'nice!', color: '#3e8b3e', bg: 'rgba(62,139,62,0.15)' },
  { code: ':wow:', display: 'wow', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
  { code: ':oof:', display: 'oof', color: '#b33e3e', bg: 'rgba(179,62,62,0.15)' },
  { code: ':thumbsup:', display: '(Y)', color: '#3e8b3e', bg: 'rgba(62,139,62,0.15)' },
  { code: ':heart:', display: '<3', color: '#b33e3e', bg: 'rgba(179,62,62,0.15)' },
  { code: ':fire:', display: '*fire*', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
  { code: ':laugh:', display: 'xD', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
  { code: ':cry:', display: ';_;', color: '#5A7ABB', bg: 'rgba(90,122,187,0.15)' },
  { code: ':thinking:', display: 'hmm..', color: '#888', bg: 'rgba(136,136,136,0.15)' },
  { code: ':clap:', display: '*clap*', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
];

function EmoteBadge({ display, color, bg }: { display: string; color: string; bg: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded" style={{ color, backgroundColor: bg }}>
      {display}
    </span>
  );
}

function renderMessage(text: string) {
  const parts: Array<string | { display: string; color: string; bg: string }> = [];
  let remaining = text;
  while (remaining.length > 0) {
    const emote = EMOTES.find(e => remaining.includes(e.code));
    if (!emote) { parts.push(remaining); break; }
    const idx = remaining.indexOf(emote.code);
    if (idx > 0) parts.push(remaining.slice(0, idx));
    parts.push({ display: emote.display, color: emote.color, bg: emote.bg });
    remaining = remaining.slice(idx + emote.code.length);
  }
  return parts.map((p, i) =>
    typeof p === 'string' ? <span key={i}>{p}</span> : <EmoteBadge key={i} {...p} />
  );
}

export function GameChat() {
  const t = useTranslations();
  const dims = useGameScale();
  const { data: session } = useSession();
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);
  const chatMessages = useSocketStore((s) => s.chatMessages);
  const unreadCount = useSocketStore((s) => s.unreadChatCount);
  const chatOpen = useSocketStore((s) => s.chatOpen);
  const setChatOpen = useSocketStore((s) => s.setChatOpen);
  const sendChatMessage = useSocketStore((s) => s.sendChatMessage);

  const [cooldown, setCooldown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!isOnlineGame) return null;

  const handleSend = (text: string, isEmote: boolean) => {
    if (cooldown) return;
    sendChatMessage(text, isEmote);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1000);
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (chatOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, chatOpen]);

  // Toggle button
  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="fixed z-40 flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase font-bold tracking-wider cursor-pointer"
        style={{
          bottom: dims.isMobile ? '8px' : '16px',
          left: dims.isMobile ? '8px' : '16px',
          backgroundColor: 'rgba(10, 10, 14, 0.9)',
          border: '1px solid rgba(196, 163, 90, 0.25)',
          color: '#c4a35a',
          boxShadow: unreadCount > 0 ? '0 0 14px rgba(196,163,90,0.3)' : '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {t('chat.title')}
        {unreadCount > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9px] font-bold rounded-full"
            style={{ backgroundColor: '#b33e3e', color: '#fff' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed z-40 flex flex-col"
      style={{
        bottom: 0,
        left: 0,
        width: dims.isMobile ? 'min(280px, calc(100vw - 16px))' : '320px',
        height: dims.isMobile ? '55vh' : '420px',
        maxHeight: '80vh',
        backgroundColor: 'rgba(8, 8, 12, 0.97)',
        borderRight: '1px solid #1e1e1e',
        borderTop: '1px solid #1e1e1e',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid rgba(196,163,90,0.1)' }}>
        <span className="text-[11px] uppercase font-bold tracking-widest" style={{ color: '#c4a35a', fontFamily: 'var(--font-display)' }}>
          {t('chat.title')}
        </span>
        <button onClick={() => setChatOpen(false)}
          className="w-6 h-6 flex items-center justify-center text-[10px] cursor-pointer transition-colors"
          style={{ color: '#666', border: '1px solid #262626', backgroundColor: 'rgba(255,255,255,0.02)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c4a35a'; e.currentTarget.style.color = '#c4a35a'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#262626'; e.currentTarget.style.color = '#666'; }}
        >
          X
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
        {chatMessages.length === 0 ? (
          <p className="text-[10px] text-center py-8" style={{ color: '#333' }}>{t('chat.noMessages')}</p>
        ) : (
          chatMessages.map((msg) => {
            const isSystem = msg.userId === 'system';
            return (
              <div key={msg.id} className="mb-2">
                <span className="text-[10px] font-bold mr-1.5" style={{
                  color: isSystem ? '#c4a35a' : '#e0e0e0',
                  fontFamily: 'var(--font-display)',
                }}>
                  {isSystem ? t('chat.systemTag') : msg.username}
                </span>
                <span className="text-[10px]" style={{
                  color: isSystem ? 'rgba(196,163,90,0.6)' : '#aaa',
                }}>
                  {msg.isEmote ? renderMessage(msg.message) : msg.message}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Preset messages */}
      <div className="px-2 pt-2 pb-1.5 shrink-0" style={{ borderTop: '1px solid rgba(196,163,90,0.08)' }}>
        <div className="flex flex-wrap gap-1 justify-center">
          {PRESET_MESSAGES.map((pm) => (
            <button
              key={pm.key}
              onClick={() => handleSend(pm.label, false)}
              disabled={cooldown}
              className="px-2.5 py-1 text-[10px] font-semibold rounded-full cursor-pointer disabled:opacity-20 transition-all"
              style={{
                backgroundColor: `${pm.color}10`,
                border: `1px solid ${pm.color}30`,
                color: pm.color,
              }}
              onMouseEnter={(e) => {
                if (!cooldown) {
                  e.currentTarget.style.backgroundColor = `${pm.color}25`;
                  e.currentTarget.style.borderColor = `${pm.color}60`;
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${pm.color}10`;
                e.currentTarget.style.borderColor = `${pm.color}30`;
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {pm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Emotes */}
      <div className="px-2 pt-1 pb-2 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <div className="flex flex-wrap gap-1 justify-center">
          {EMOTES.map((e) => (
            <button
              key={e.code}
              onClick={() => handleSend(e.code, true)}
              disabled={cooldown}
              className="px-1.5 py-0.5 text-[9px] font-bold rounded cursor-pointer disabled:opacity-20 transition-all"
              style={{ color: e.color, backgroundColor: e.bg, border: `1px solid ${e.color}20` }}
              onMouseEnter={(ev) => {
                if (!cooldown) { ev.currentTarget.style.transform = 'scale(1.15)'; ev.currentTarget.style.boxShadow = `0 0 8px ${e.color}40`; }
              }}
              onMouseLeave={(ev) => {
                ev.currentTarget.style.transform = 'scale(1)'; ev.currentTarget.style.boxShadow = 'none';
              }}
            >
              {e.display}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
