'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import { useSession } from 'next-auth/react';
import { useGameScale } from './GameScaleContext';

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
  { code: ':star:', display: '*', color: '#c4a35a', bg: 'rgba(196,163,90,0.2)' },
];

function EmoteBadge({ display, color, bg }: { display: string; color: string; bg: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded" style={{ color, backgroundColor: bg }}>
      {display}
    </span>
  );
}

function renderMessage(text: string) {
  // Replace emote codes with styled badges
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
  const isSpectating = useSocketStore((s) => s.isSpectating);
  const chatMessages = useSocketStore((s) => s.chatMessages);
  const unreadCount = useSocketStore((s) => s.unreadChatCount);
  const chatOpen = useSocketStore((s) => s.chatOpen);
  const setChatOpen = useSocketStore((s) => s.setChatOpen);
  const sendChatMessage = useSocketStore((s) => s.sendChatMessage);

  const [input, setInput] = useState('');
  const [showEmotes, setShowEmotes] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Don't render for non-online games
  if (!isOnlineGame && !isSpectating) return null;

  const handleSend = () => {
    if (!input.trim() || cooldown) return;
    sendChatMessage(input, false);
    setInput('');
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1000);
  };

  const handleEmote = (code: string) => {
    sendChatMessage(code, true);
    setShowEmotes(false);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1000);
  };

  const handleReport = async (msg: { id: string; userId: string; username: string; message: string }) => {
    if (!session?.user?.id || msg.userId === 'system' || msg.userId === session.user.id) return;
    try {
      const roomCode = useSocketStore.getState().roomCode ?? useSocketStore.getState().spectatingRoomCode ?? '';
      await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msg.id,
          targetId: msg.userId,
          targetName: msg.username,
          messageText: msg.message,
          roomCode,
        }),
        credentials: 'include',
      });
    } catch { /* ignore */ }
  };

  // Auto-scroll
  useEffect(() => {
    if (chatOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, chatOpen]);

  // Toggle button (always visible) — LEFT side, more prominent
  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="fixed z-40 flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase font-bold tracking-wider cursor-pointer"
        style={{
          bottom: dims.isMobile ? '8px' : '16px',
          left: dims.isMobile ? '8px' : '16px',
          backgroundColor: 'rgba(196, 163, 90, 0.1)',
          border: '1px solid rgba(196, 163, 90, 0.3)',
          color: '#c4a35a',
          boxShadow: unreadCount > 0 ? '0 0 12px rgba(179,62,62,0.4)' : '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {t('chat.title')}
        {unreadCount > 0 && (
          <span className="flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold rounded-full"
            style={{ backgroundColor: '#b33e3e', color: '#fff' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  // Open chat panel
  return (
    <div
      className="fixed z-40 flex flex-col"
      style={{
        bottom: 0,
        left: 0,
        width: dims.isMobile ? '260px' : '320px',
        height: dims.isMobile ? '55vh' : '400px',
        maxHeight: '80vh',
        backgroundColor: 'rgba(10, 10, 14, 0.95)',
        borderRight: '1px solid #262626',
        borderTop: '1px solid #262626',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
        <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: '#c4a35a' }}>
          {t('chat.title')}
        </span>
        <button onClick={() => setChatOpen(false)}
          className="text-[10px] px-1.5 py-0.5 cursor-pointer" style={{ color: '#888', border: '1px solid #333' }}>
          X
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
        {chatMessages.length === 0 ? (
          <p className="text-[10px] text-center py-4" style={{ color: '#444' }}>{t('chat.noMessages')}</p>
        ) : (
          chatMessages.map((msg) => {
            const isSystem = msg.userId === 'system';
            const isOwnMsg = msg.userId === session?.user?.id;
            return (
              <div key={msg.id} className="group mb-1.5 flex items-start gap-1.5" style={{ fontFamily: "'Inter', sans-serif" }}>
                <div className="flex-1 min-w-0">
                  {/* Username */}
                  <span className="text-[10px] font-bold mr-1" style={{
                    color: isSystem ? '#c4a35a' : msg.isSpectator ? '#666' : '#e0e0e0',
                  }}>
                    {isSystem ? t('chat.systemTag') : msg.username}
                    {msg.isSpectator && !isSystem && (
                      <span className="text-[8px] ml-1 px-1 py-px" style={{
                        backgroundColor: 'rgba(136,136,136,0.1)', border: '1px solid #333', color: '#666',
                      }}>{t('chat.spectatorTag')}</span>
                    )}
                  </span>
                  {/* Message */}
                  <span className="text-[10px]" style={{
                    color: isSystem ? 'rgba(196,163,90,0.7)' : msg.isSpectator ? '#555' : '#ccc',
                  }}>
                    {msg.isEmote ? renderMessage(msg.message) : msg.message}
                  </span>
                </div>
                {/* Report button (on hover, not for own or system messages) */}
                {!isSystem && !isOwnMsg && (
                  <button
                    onClick={() => handleReport(msg)}
                    className="opacity-0 group-hover:opacity-100 text-[8px] px-1 py-0.5 shrink-0 cursor-pointer"
                    style={{ color: '#b33e3e', border: '1px solid rgba(179,62,62,0.3)', transition: 'opacity 0.1s' }}
                  >
                    {t('chat.report')}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Emote picker */}
      {showEmotes && (
        <div className="px-3 py-2 shrink-0 flex flex-wrap gap-1" style={{ borderTop: '1px solid #1e1e1e' }}>
          {EMOTES.map((e) => (
            <button key={e.code} onClick={() => handleEmote(e.code)}
              className="px-1.5 py-0.5 text-[9px] font-bold rounded cursor-pointer"
              style={{ backgroundColor: e.bg, color: e.color, border: '1px solid transparent' }}>
              {e.display}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-1 px-2 py-1.5 shrink-0" style={{ borderTop: '1px solid #1e1e1e' }}>
        <button onClick={() => setShowEmotes(!showEmotes)}
          className="text-[10px] px-1.5 py-1 shrink-0 cursor-pointer"
          style={{
            backgroundColor: showEmotes ? 'rgba(196,163,90,0.15)' : 'transparent',
            border: `1px solid ${showEmotes ? 'rgba(196,163,90,0.3)' : '#333'}`,
            color: showEmotes ? '#c4a35a' : '#888',
          }}>
          {t('chat.emotes')}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 200))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder={cooldown ? t('chat.cooldown') : t('chat.placeholder')}
          disabled={cooldown}
          className="flex-1 min-w-0 px-2 py-1 text-[11px] focus:outline-none"
          style={{
            backgroundColor: '#0a0a0a', border: '1px solid #262626', color: '#e0e0e0',
            fontFamily: "'Inter', sans-serif", opacity: cooldown ? 0.5 : 1,
          }}
        />
        <button onClick={handleSend} disabled={cooldown || !input.trim()}
          className="text-[10px] px-2 py-1 shrink-0 cursor-pointer disabled:opacity-30"
          style={{ backgroundColor: 'rgba(196,163,90,0.1)', border: '1px solid rgba(196,163,90,0.3)', color: '#c4a35a' }}>
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
