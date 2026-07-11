'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import { useGameScale } from './GameScaleContext';
import { CHAT_EMOTES, CHAT_MAX_LENGTH, CHAT_COOLDOWN_MS } from '@/lib/chat/constants';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { BlockPlayerPopup } from '@/components/chat/BlockPlayerPopup';
import { ReportPlayerPopup, type ReportableMessage } from '@/components/chat/ReportPlayerPopup';
import { useDmStore } from '@/stores/dmStore';
import { useSession } from 'next-auth/react';

const EMOTE_BY_CODE = new Map(CHAT_EMOTES.map((e) => [e.code, e]));

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
    let found: { code: string; display: string; color: string; bg: string } | undefined;
    let foundIdx = -1;
    for (const e of CHAT_EMOTES) {
      const idx = remaining.indexOf(e.code);
      if (idx !== -1 && (foundIdx === -1 || idx < foundIdx)) {
        found = e;
        foundIdx = idx;
      }
    }
    if (!found) { parts.push(remaining); break; }
    if (foundIdx > 0) parts.push(remaining.slice(0, foundIdx));
    parts.push({ display: found.display, color: found.color, bg: found.bg });
    remaining = remaining.slice(foundIdx + found.code.length);
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
  const isSpectating = useSocketStore((s) => s.isSpectating);
  const chatLockState = useSocketStore((s) => s.chatLockState);
  const chatOpponent = useSocketStore((s) => s.chatOpponent);
  const chatFriendStatus = useSocketStore((s) => s.chatFriendStatus);
  const chatFriendshipId = useSocketStore((s) => s.chatFriendshipId);
  const requestChatLockState = useSocketStore((s) => s.requestChatLockState);
  const roomCode = useSocketStore((s) => s.roomCode);

  const [input, setInput] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportAttached, setReportAttached] = useState<ReportableMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOnlineGame && !isSpectating) requestChatLockState();
  }, [isOnlineGame, isSpectating, requestChatLockState]);

  useEffect(() => {
    if (chatOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, chatOpen]);

  const handleSend = useCallback((text: string, isEmote: boolean) => {
    if (cooldown || !text) return;
    sendChatMessage(text, isEmote);
    setCooldown(true);
    setTimeout(() => setCooldown(false), CHAT_COOLDOWN_MS);
  }, [cooldown, sendChatMessage]);

  const submitInput = () => {
    const text = input.trim();
    if (!text) return;
    handleSend(text.slice(0, CHAT_MAX_LENGTH), false);
    setInput('');
  };

  const sendFriendRequest = async () => {
    if (!chatOpponent || friendBusy) return;
    setFriendBusy(true);
    try {
      await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: chatOpponent.userId }),
      });
    } catch { }
    setFriendBusy(false);
    requestChatLockState();
  };

  const acceptFriendRequest = async () => {
    if (!chatFriendshipId || friendBusy) return;
    setFriendBusy(true);
    try {
      await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId: chatFriendshipId }),
      });
    } catch { }
    setFriendBusy(false);
    requestChatLockState();
  };

  if (!isOnlineGame) return null;

  const isLockedForPlayer = !isSpectating && (chatLockState === 'off' || chatLockState === 'friends_only');
  const opponentMessages: ReportableMessage[] = chatOpponent
    ? chatMessages.filter((m) => m.userId === chatOpponent.userId && !m.isEmote).map((m) => ({ text: m.message, at: m.timestamp }))
    : [];

  const friendAction = (() => {
    if (isSpectating || !chatOpponent) return null;
    if (chatFriendStatus === 'friends') return null;
    if (chatFriendStatus === 'pending_out') {
      return { label: t('chat.menu.requestSent'), onClick: undefined };
    }
    if (chatFriendStatus === 'pending_in') {
      return { label: t('chat.menu.acceptRequest'), onClick: acceptFriendRequest };
    }
    return { label: t('chat.menu.addFriend'), onClick: sendFriendRequest };
  })();

  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="fixed z-40 flex items-center gap-1.5 uppercase font-bold tracking-wider cursor-pointer"
        style={{
          fontSize: dims.isMobile ? '13px' : '11px',
          padding: dims.isMobile ? '10px 14px' : '8px 12px',
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
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 font-bold rounded-full"
            style={{ fontSize: dims.isMobile ? '11px' : '9px', backgroundColor: '#b33e3e', color: '#fff' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  const fontSize = dims.isMobile ? '14px' : '10px';

  const panelContent = (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid rgba(196,163,90,0.1)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="uppercase font-bold tracking-widest shrink-0" style={{ fontSize: dims.isMobile ? '13px' : '11px', color: '#c4a35a', fontFamily: 'var(--font-display)' }}>
            {t('chat.title')}
          </span>
          {!isSpectating && chatOpponent && (
            <div className="relative min-w-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1 cursor-pointer truncate max-w-[140px]"
                style={{ fontSize: dims.isMobile ? '12px' : '10px', color: '#999', background: 'none', border: 'none', padding: '2px 4px' }}
              >
                <span className="truncate">{chatOpponent.username}</span>
                <span style={{ fontSize: '8px', opacity: 0.6 }}>&#x25BC;</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute left-0 top-full mt-1 flex flex-col min-w-[180px]"
                  style={{ backgroundColor: 'rgba(10,10,16,0.98)', border: '1px solid #262626', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', zIndex: 5 }}
                >
                  {friendAction && (
                    <button
                      onClick={() => { setMenuOpen(false); friendAction.onClick?.(); }}
                      disabled={!friendAction.onClick || friendBusy}
                      className="text-left px-3 py-2 text-[11px] cursor-pointer disabled:opacity-40"
                      style={{ color: '#c4a35a', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      {friendAction.label}
                    </button>
                  )}
                  {chatFriendStatus === 'friends' && session?.user?.id && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        useDmStore.getState().openThread(session.user.id, chatOpponent);
                      }}
                      className="text-left px-3 py-2 text-[11px] cursor-pointer"
                      style={{ color: '#c4a35a', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      {t('chat.menu.privateMessage')}
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); setReportAttached(null); setReportOpen(true); }}
                    className="text-left px-3 py-2 text-[11px] cursor-pointer"
                    style={{ color: '#999', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {t('chat.menu.report')}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); setBlockOpen(true); }}
                    className="text-left px-3 py-2 text-[11px] cursor-pointer"
                    style={{ color: '#b33e3e', background: 'none', border: 'none' }}
                  >
                    {t('chat.menu.block')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <button onClick={() => { setMenuOpen(false); setChatOpen(false); }}
          className={`${dims.isMobile ? 'w-9 h-9 text-[14px]' : 'w-6 h-6 text-[10px]'} flex items-center justify-center cursor-pointer transition-colors shrink-0`}
          style={{ color: '#666', border: '1px solid #262626', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          X
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
        {chatMessages.length === 0 ? (
          <p className="text-center py-8" style={{ fontSize: dims.isMobile ? '13px' : '10px', color: '#333' }}>{t('chat.noMessages')}</p>
        ) : (
          chatMessages.map((msg) => {
            const isSystem = msg.userId === 'system';
            const isOpponentMsg = !isSystem && chatOpponent != null && msg.userId === chatOpponent.userId;
            return (
              <div key={msg.id} className="mb-2 group flex items-start gap-1.5">
                <div className="min-w-0 flex-1">
                  {msg.isSpectator && (
                    <span className="uppercase font-bold mr-1.5" style={{ fontSize: dims.isMobile ? '10px' : '8px', color: '#5A7ABB', letterSpacing: '0.1em' }}>
                      {t('chat.spectatorTag')}
                    </span>
                  )}
                  <span className="font-bold mr-1.5" style={{
                    fontSize,
                    color: isSystem ? '#c4a35a' : '#e0e0e0',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {isSystem ? t('chat.systemTag') : msg.username}
                  </span>
                  <span style={{ fontSize, color: isSystem ? 'rgba(196,163,90,0.6)' : '#aaa', overflowWrap: 'anywhere' }}>
                    {msg.isEmote ? renderMessage(msg.message) : msg.message}
                  </span>
                </div>
                {isOpponentMsg && !msg.isEmote && (
                  <button
                    onClick={() => { setReportAttached({ text: msg.message, at: msg.timestamp }); setReportOpen(true); }}
                    className={`shrink-0 cursor-pointer font-bold ${dims.isMobile ? '' : 'opacity-0 group-hover:opacity-100'}`}
                    style={{ fontSize: dims.isMobile ? '12px' : '9px', color: '#b33e3e', background: 'none', border: 'none', padding: '0 2px', transition: 'opacity 0.15s' }}
                    aria-label={t('chat.menu.report')}
                  >
                    !
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {isLockedForPlayer ? (
        <div className="px-3 py-3 shrink-0 flex flex-col items-center gap-2" style={{ borderTop: '1px solid rgba(196,163,90,0.08)' }}>
          <span className="text-center" style={{ fontSize: dims.isMobile ? '12px' : '10px', color: '#888' }}>
            {chatLockState === 'friends_only'
              ? t('chat.lockedFriendsOnly', { player: chatOpponent?.username ?? '' })
              : t('chat.lockedOff')}
          </span>
          {chatLockState === 'friends_only' && friendAction && (
            <button
              onClick={() => friendAction.onClick?.()}
              disabled={!friendAction.onClick || friendBusy}
              className="uppercase font-bold cursor-pointer disabled:opacity-40"
              style={{
                fontSize: dims.isMobile ? '11px' : '10px',
                padding: '5px 14px',
                color: '#c4a35a',
                backgroundColor: 'rgba(196,163,90,0.1)',
                border: 'none',
                letterSpacing: '0.12em',
              }}
            >
              {friendAction.label}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="px-2 pt-2 shrink-0" style={{ borderTop: '1px solid rgba(196,163,90,0.08)' }}>
            <div className="flex flex-wrap gap-1 justify-center">
              {CHAT_EMOTES.map((e) => (
                <button
                  key={e.code}
                  onClick={() => handleSend(e.code, true)}
                  disabled={cooldown}
                  className="font-bold rounded cursor-pointer disabled:opacity-20 transition-all"
                  style={{ fontSize: dims.isMobile ? '13px' : '9px', padding: dims.isMobile ? '6px 10px' : '2px 6px', color: e.color, backgroundColor: e.bg, border: `1px solid ${e.color}20` }}
                >
                  {e.display}
                </button>
              ))}
            </div>
          </div>
          <div className="px-2 pt-1.5 pb-2 shrink-0 flex items-center gap-1.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, CHAT_MAX_LENGTH))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitInput(); }}
              placeholder={cooldown ? t('chat.cooldownShort') : t('chat.inputPlaceholder')}
              maxLength={CHAT_MAX_LENGTH}
              className="flex-1 min-w-0 px-2.5 outline-none"
              style={{
                fontSize: dims.isMobile ? '14px' : '11px',
                paddingTop: dims.isMobile ? '9px' : '6px',
                paddingBottom: dims.isMobile ? '9px' : '6px',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid #262626',
                color: '#e0e0e0',
              }}
            />
            {input.length >= CHAT_MAX_LENGTH - 30 && (
              <span className="shrink-0 tabular-nums" style={{ fontSize: '9px', color: input.length >= CHAT_MAX_LENGTH ? '#b33e3e' : '#555' }}>
                {CHAT_MAX_LENGTH - input.length}
              </span>
            )}
            <button
              onClick={submitInput}
              disabled={cooldown || input.trim().length === 0}
              className="uppercase font-bold cursor-pointer disabled:opacity-30 shrink-0"
              style={{
                fontSize: dims.isMobile ? '12px' : '10px',
                padding: dims.isMobile ? '9px 14px' : '6px 12px',
                color: '#0a0a0a',
                backgroundColor: '#c4a35a',
                border: 'none',
                letterSpacing: '0.1em',
              }}
            >
              {t('chat.send')}
            </button>
          </div>
        </>
      )}
    </>
  );

  const popups = (
    <>
      {blockOpen && chatOpponent && (
        <BlockPlayerPopup
          target={chatOpponent}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => requestChatLockState()}
        />
      )}
      {reportOpen && chatOpponent && (
        <ReportPlayerPopup
          target={chatOpponent}
          context="game_chat"
          roomCode={roomCode}
          attachedMessage={reportAttached}
          recentMessages={opponentMessages}
          onClose={() => { setReportOpen(false); setReportAttached(null); }}
        />
      )}
    </>
  );

  if (dims.isMobile) {
    if (typeof document === 'undefined') return null;
    return createPortal(
      <>
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: Z_APP_MODAL, backgroundColor: 'rgba(6, 6, 10, 0.98)' }}
        >
          {panelContent}
        </div>
        {popups}
      </>,
      document.body,
    );
  }

  return (
    <>
      <div
        className="fixed z-40 flex flex-col"
        style={{
          bottom: 0,
          left: 0,
          width: '320px',
          height: '420px',
          maxHeight: '80vh',
          backgroundColor: 'rgba(8, 8, 12, 0.97)',
          borderRight: '1px solid #1e1e1e',
          borderTop: '1px solid #1e1e1e',
        }}
      >
        {panelContent}
      </div>
      {popups}
    </>
  );
}
