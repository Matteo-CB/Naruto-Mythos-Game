'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useDmStore } from '@/stores/dmStore';
import { useSocketStore } from '@/lib/socket/client';
import { DM_MAX_LENGTH, CHAT_COOLDOWN_MS } from '@/lib/chat/constants';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { BlockPlayerPopup } from '@/components/chat/BlockPlayerPopup';
import { ReportPlayerPopup } from '@/components/chat/ReportPlayerPopup';

export function DMPanel() {
  const t = useTranslations();
  const { data: session } = useSession();
  const isOpen = useDmStore((s) => s.isOpen);
  const view = useDmStore((s) => s.view);
  const partner = useDmStore((s) => s.partner);
  const threadKey = useDmStore((s) => s.threadKey);
  const friendshipId = useDmStore((s) => s.friendshipId);
  const locked = useDmStore((s) => s.locked);
  const threads = useDmStore((s) => s.threads);
  const messages = useDmStore((s) => s.messages);
  const loadingThreads = useDmStore((s) => s.loadingThreads);
  const loadingMessages = useDmStore((s) => s.loadingMessages);
  const close = useDmStore((s) => s.close);
  const backToList = useDmStore((s) => s.backToList);
  const openThread = useDmStore((s) => s.openThread);
  const loadMessages = useDmStore((s) => s.loadMessages);
  const refreshBadge = useDmStore((s) => s.refreshBadge);

  const sendDmSocket = useSocketStore((s) => s.sendDm);
  const markDmRead = useSocketStore((s) => s.markDmRead);
  const socketConnected = useSocketStore((s) => s.connected);

  const [input, setInput] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const myUserId = session?.user?.id ?? null;

  useEffect(() => {
    if (isOpen && view === 'thread' && threadKey && messages.length > 0) {
      markDmRead(threadKey);
      refreshBadge();
    }
  }, [isOpen, view, threadKey, messages.length, markDmRead, refreshBadge]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, view]);

  if (!isOpen || typeof document === 'undefined') return null;

  const submitInput = async () => {
    const text = input.trim();
    if (!text || cooldown || !partner || !threadKey) return;
    setInput('');
    setCooldown(true);
    setTimeout(() => setCooldown(false), CHAT_COOLDOWN_MS);
    if (socketConnected) {
      sendDmSocket(partner.userId, text.slice(0, DM_MAX_LENGTH));
    } else {
      try {
        const res = await fetch(`/api/dm/${encodeURIComponent(threadKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text.slice(0, DM_MAX_LENGTH) }),
        });
        if (res.ok) {
          const data = await res.json();
          useDmStore.getState().receiveMessage(data.message);
        }
      } catch { }
    }
  };

  const removeFriend = async () => {
    if (!friendshipId || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE' });
      loadMessages();
    } catch { }
    setBusy(false);
  };

  const panel = (
    <motion.div
      initial={{ x: 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed inset-y-0 right-0 flex flex-col w-full sm:w-[400px]"
      style={{
        zIndex: Z_APP_MODAL,
        backgroundColor: 'rgba(8, 8, 12, 0.98)',
        boxShadow: '-12px 0 48px rgba(0,0,0,0.6)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(196,163,90,0.12)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {view === 'thread' && (
            <button
              onClick={backToList}
              className="shrink-0 cursor-pointer font-bold"
              style={{ color: '#888', background: 'none', border: 'none', fontSize: '14px', padding: '2px 6px' }}
              aria-label={t('dm.back')}
            >
              &#x25C0;
            </button>
          )}
          <span className="uppercase font-bold tracking-widest truncate" style={{ fontSize: '12px', color: '#c4a35a', fontFamily: 'var(--font-display)' }}>
            {view === 'thread' && partner ? partner.username : t('dm.title')}
          </span>
          {view === 'thread' && partner && (
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="cursor-pointer"
                style={{ color: '#666', background: 'none', border: 'none', fontSize: '10px', padding: '2px 6px' }}
              >
                &#x25BC;
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 flex flex-col min-w-[190px]"
                  style={{ backgroundColor: 'rgba(10,10,16,0.98)', border: '1px solid #262626', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', zIndex: 5 }}
                >
                  <button
                    onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                    className="text-left px-3 py-2 text-[11px] cursor-pointer"
                    style={{ color: '#999', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {t('chat.menu.report')}
                  </button>
                  {friendshipId && (
                    <button
                      onClick={() => { setMenuOpen(false); removeFriend(); }}
                      disabled={busy}
                      className="text-left px-3 py-2 text-[11px] cursor-pointer disabled:opacity-40"
                      style={{ color: '#999', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      {t('dm.removeFriend')}
                    </button>
                  )}
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
        <button
          onClick={() => { setMenuOpen(false); close(); }}
          className="w-8 h-8 flex items-center justify-center cursor-pointer shrink-0"
          style={{ color: '#666', border: '1px solid #262626', backgroundColor: 'rgba(255,255,255,0.02)', fontSize: '12px' }}
        >
          X
        </button>
      </div>

      {view === 'list' ? (
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {loadingThreads && threads.length === 0 ? (
            <p className="text-center py-10 text-[11px]" style={{ color: '#444' }}>...</p>
          ) : threads.length === 0 ? (
            <p className="text-center py-10 px-6 text-[12px] leading-relaxed" style={{ color: '#555' }}>
              {t('dm.emptyList')}
            </p>
          ) : (
            threads.map((th) => (
              <button
                key={th.threadKey}
                onClick={() => { if (myUserId) openThread(myUserId, th.partner); }}
                className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left"
                style={{ background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-bold text-[12px] truncate" style={{ color: '#e0e0e0', fontFamily: 'var(--font-display)' }}>
                    {th.partner.username}
                  </span>
                  {th.lastMessage && (
                    <span className="font-body-force text-[11px] truncate" style={{ color: '#777' }}>
                      {th.lastMessage.body}
                    </span>
                  )}
                </div>
                {th.unreadCount > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9px] font-bold rounded-full shrink-0"
                    style={{ backgroundColor: '#b33e3e', color: '#fff' }}>
                    {th.unreadCount > 99 ? '99+' : th.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
            {loadingMessages && messages.length === 0 ? (
              <p className="text-center py-10 text-[11px]" style={{ color: '#444' }}>...</p>
            ) : messages.length === 0 ? (
              <p className="text-center py-10 text-[12px]" style={{ color: '#555' }}>
                {partner ? t('dm.placeholder', { player: partner.username }) : ''}
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.senderId === myUserId;
                return (
                  <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="font-body-force max-w-[80%] px-3 py-1.5 text-[12px] leading-snug"
                      style={{
                        backgroundColor: mine ? 'rgba(196,163,90,0.12)' : 'rgba(255,255,255,0.04)',
                        color: mine ? '#e6d5ac' : '#ccc',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {locked ? (
            <div className="px-4 py-3 shrink-0 text-center" style={{ borderTop: '1px solid rgba(196,163,90,0.08)' }}>
              <span className="text-[11px]" style={{ color: '#888' }}>
                {locked === 'not_friends' ? t('dm.lockedNotFriends') : t('dm.lockedDisabled')}
              </span>
            </div>
          ) : (
            <div className="px-3 py-2.5 shrink-0 flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(196,163,90,0.08)' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, DM_MAX_LENGTH))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitInput(); }}
                placeholder={partner ? t('dm.placeholder', { player: partner.username }) : ''}
                maxLength={DM_MAX_LENGTH}
                className="flex-1 min-w-0 px-3 py-2 outline-none text-[13px]"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid #262626', color: '#e0e0e0' }}
              />
              {input.length >= DM_MAX_LENGTH - 30 && (
                <span className="shrink-0 tabular-nums text-[9px]" style={{ color: input.length >= DM_MAX_LENGTH ? '#b33e3e' : '#555' }}>
                  {DM_MAX_LENGTH - input.length}
                </span>
              )}
              <button
                onClick={submitInput}
                disabled={cooldown || input.trim().length === 0}
                className="uppercase font-bold cursor-pointer disabled:opacity-30 shrink-0 text-[11px] px-3.5 py-2"
                style={{ color: '#0a0a0a', backgroundColor: '#c4a35a', border: 'none', letterSpacing: '0.1em' }}
              >
                {t('chat.send')}
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );

  return createPortal(
    <>
      <AnimatePresence>{panel}</AnimatePresence>
      {blockOpen && partner && (
        <BlockPlayerPopup
          target={partner}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => loadMessages()}
        />
      )}
      {reportOpen && partner && (
        <ReportPlayerPopup
          target={partner}
          context="dm"
          recentMessages={messages.filter((m) => m.senderId === partner.userId).map((m) => ({ text: m.body, at: m.createdAt }))}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>,
    document.body,
  );
}
