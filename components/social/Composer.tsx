'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { DeckEmbed } from './DeckEmbed';
import { ReplayEmbed } from './ReplayEmbed';
import { TenorGifPicker } from './TenorGifPicker';
import type { DeckSnapshot, ReplaySnapshot, PostView } from '@/lib/social/types';

const MAX = 500;

interface DeckRow { id: string; name: string; cardIds: string[]; missionIds: string[]; }
interface ReplayRow extends ReplaySnapshot { completedAt?: string; }

function PickerModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: Z_APP_MODAL, backgroundColor: 'rgba(0,0,0,0.72)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md flex flex-col overflow-hidden"
        style={{ backgroundColor: '#111114', border: '1px solid #26262c', maxHeight: '80vh', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #1c1c20' }}>
          <span className="font-display text-sm uppercase tracking-widest" style={{ color: '#c4a35a' }}>{title}</span>
          <button type="button" onClick={onClose} className="text-[11px] uppercase tracking-widest px-2 py-1" style={{ color: '#888' }}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{children}</div>
      </motion.div>
    </div>
  );
}

export function Composer({ onPosted, parentId, prefillReplay, prefillDeck, autoFocus }: {
  onPosted: (post: PostView) => void;
  parentId?: string;
  prefillReplay?: { gameId: string; actionIndex?: number } | null;
  prefillDeck?: { deckId: string } | null;
  autoFocus?: boolean;
}) {
  const t = useTranslations('feed');
  const { data: session } = useSession();
  const [body, setBody] = useState('');
  const [deck, setDeck] = useState<DeckSnapshot | null>(null);
  const [replay, setReplay] = useState<ReplaySnapshot | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gifEnabled, setGifEnabled] = useState(false);

  const [showDecks, setShowDecks] = useState(false);
  const [showReplays, setShowReplays] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [replays, setReplays] = useState<ReplayRow[]>([]);

  useEffect(() => {
    fetch('/api/tenor/search?q=').then((r) => r.json()).then((d) => setGifEnabled(!d.disabled)).catch(() => setGifEnabled(false));
  }, []);

  const prefillReplayGameId = prefillReplay?.gameId;
  const prefillReplayAction = prefillReplay?.actionIndex;
  useEffect(() => {
    if (prefillReplayGameId) {
      fetch('/api/user/replays').then((r) => r.json()).then((d) => {
        const found = (d.replays ?? []).find((rp: ReplayRow) => rp.gameId === prefillReplayGameId);
        if (found) setReplay({ ...found, actionIndex: prefillReplayAction });
      }).catch(() => {});
    }
  }, [prefillReplayGameId, prefillReplayAction]);

  const prefillDeckId = prefillDeck?.deckId;
  useEffect(() => {
    if (prefillDeckId) {
      fetch('/api/decks').then((r) => r.json()).then((d) => {
        const list: DeckRow[] = Array.isArray(d.decks) ? d.decks : Array.isArray(d) ? d : [];
        const found = list.find((dk) => dk.id === prefillDeckId);
        if (found) setDeck({ deckId: found.id, name: found.name, cardIds: found.cardIds, missionIds: found.missionIds });
      }).catch(() => {});
    }
  }, [prefillDeckId]);

  const openDecks = useCallback(() => {
    setShowDecks(true);
    if (decks.length === 0) fetch('/api/decks').then((r) => r.json()).then((d) => setDecks(Array.isArray(d.decks) ? d.decks : d)).catch(() => {});
  }, [decks.length]);

  const openReplays = useCallback(() => {
    setShowReplays(true);
    if (replays.length === 0) fetch('/api/user/replays').then((r) => r.json()).then((d) => setReplays(d.replays ?? [])).catch(() => {});
  }, [replays.length]);

  if (!session?.user?.id) {
    return <div className="px-4 py-6 text-center text-sm" style={{ color: '#888', backgroundColor: '#0d0c10' }}>{t('loginToPost')}</div>;
  }

  const canPost = (body.trim().length > 0 || deck || replay || gifUrl) && !busy && body.length <= MAX;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { body: body.trim(), parentId };
      if (deck?.deckId) payload.deckId = deck.deckId;
      if (replay?.gameId) { payload.replayGameId = replay.gameId; if (typeof replay.actionIndex === 'number') payload.replayActionIndex = replay.actionIndex; }
      if (gifUrl) payload.gifUrl = gifUrl;
      const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        const map: Record<string, string> = {
          'feed.error.tooLong': 'error.tooLong',
          'feed.error.deckNotYours': 'error.deckNotYours',
          'feed.error.replayNotYours': 'error.replayNotYours',
          'feed.error.parentGone': 'error.parentGone',
          'feed.error.empty': 'error.empty',
          'chat.blockedToxic': 'error.blocked',
        };
        setError(t(map[data.errorKey as string] ?? 'error.generic'));
        return;
      }
      onPosted(data.post);
      setBody(''); setDeck(null); setReplay(null); setGifUrl(null);
    } catch {
      setError(t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3" style={{ backgroundColor: '#0d0c10', borderBottom: '1px solid #1a1a1e' }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? t('replyPlaceholder') : t('composerPlaceholder')}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        className="w-full resize-none px-2 py-1.5 text-sm focus:outline-none"
        style={{ backgroundColor: 'transparent', color: '#e6e4dd' }}
      />

      {deck && <div className="relative"><DeckEmbed deck={deck} /><RemoveBtn onClick={() => setDeck(null)} label={t('removeDeck')} /></div>}
      {replay && <div className="relative"><ReplayEmbed replay={{ ...replay, available: true }} /><RemoveBtn onClick={() => setReplay(null)} label={t('removeReplay')} /></div>}
      {gifUrl && (
        <div className="relative mt-2 inline-block overflow-hidden" style={{ maxWidth: 240 }}>
          {}
          <img src={gifUrl} alt="" style={{ width: '100%', display: 'block' }} />
          <RemoveBtn onClick={() => setGifUrl(null)} label={t('removeGif')} />
        </div>
      )}

      {error && <div className="mt-2 text-[11px] px-2 py-1" style={{ backgroundColor: 'rgba(179,62,62,0.1)', color: '#c26a6a' }}>{error}</div>}

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <ToolBtn onClick={openDecks} disabled={!!deck}>{t('attachDeck')}</ToolBtn>
        <ToolBtn onClick={openReplays} disabled={!!replay}>{t('attachReplay')}</ToolBtn>
        {gifEnabled && <ToolBtn onClick={() => setShowGif(true)} disabled={!!gifUrl}>{t('addGif')}</ToolBtn>}
        <div className="flex-1" />
        <span className="font-inter-force text-[10px]" style={{ color: body.length > MAX ? '#b33e3e' : '#55555c' }}>{body.length}/{MAX}</span>
        <button
          type="button"
          onClick={submit}
          disabled={!canPost}
          className="font-display text-[11px] uppercase tracking-widest px-4 py-1.5"
          style={{ backgroundColor: canPost ? '#c4a35a' : '#1c1c20', color: canPost ? '#0a0a0a' : '#555', cursor: canPost ? 'pointer' : 'default', opacity: busy ? 0.6 : 1 }}
        >
          {parentId ? t('reply') : t('post')}
        </button>
      </div>

      {showDecks && (
        <PickerModal title={t('chooseDeck')} onClose={() => setShowDecks(false)}>
          {decks.length === 0 ? <div className="p-6 text-center text-xs" style={{ color: '#666' }}>{t('noDecks')}</div> : decks.map((d) => (
            <button key={d.id} type="button" onClick={() => { setDeck({ deckId: d.id, name: d.name, cardIds: d.cardIds, missionIds: d.missionIds }); setShowDecks(false); }}
              className="block w-full text-left px-3 py-2.5 text-sm" style={{ color: '#e0e0e0', borderBottom: '1px solid #17171a' }}>
              {d.name}
            </button>
          ))}
        </PickerModal>
      )}

      {showReplays && (
        <PickerModal title={t('chooseReplay')} onClose={() => setShowReplays(false)}>
          {replays.length === 0 ? <div className="p-6 text-center text-xs" style={{ color: '#666' }}>{t('noReplays')}</div> : replays.map((r) => (
            <button key={r.gameId} type="button" onClick={() => { setReplay(r); setShowReplays(false); }}
              className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2" style={{ color: '#e0e0e0', borderBottom: '1px solid #17171a' }}>
              <span className="truncate">{r.player1Name} vs {r.player2Name}</span>
              <span className="text-[11px] tabular-nums shrink-0" style={{ color: '#888' }}>{r.player1Score}-{r.player2Score}</span>
            </button>
          ))}
        </PickerModal>
      )}

      {showGif && <TenorGifPicker onSelect={(url) => { setGifUrl(url); setShowGif(false); }} onClose={() => setShowGif(false)} />}
    </div>
  );
}

function ToolBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="font-display text-[10px] uppercase tracking-wider px-2.5 py-1.5"
      style={{ backgroundColor: 'rgba(196,163,90,0.08)', color: disabled ? '#4a4a4e' : '#c4a35a', cursor: disabled ? 'default' : 'pointer' }}>
      {children}
    </button>
  );
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="absolute top-1 right-1 font-display text-xs px-2 py-0.5"
      style={{ backgroundColor: 'rgba(10,10,10,0.85)', color: '#c26a6a', zIndex: 2 }}>✕</button>
  );
}
