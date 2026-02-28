'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import { Link } from '@/lib/i18n/navigation';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function GameEndScreen() {
  const t = useTranslations();
  const { data: session } = useSession();
  const gameOver = useGameStore((s) => s.gameOver);
  const winner = useGameStore((s) => s.winner);
  const visibleState = useGameStore((s) => s.visibleState);
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);
  const isAIGame = useGameStore((s) => s.isAIGame);
  const gameState = useGameStore((s) => s.gameState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);
  const resetGame = useGameStore((s) => s.resetGame);
  const replayInitialState = useGameStore((s) => s.replayInitialState);
  const draftDeckCardIds = useGameStore((s) => s.draftDeckCardIds);
  const draftDeckMissionIds = useGameStore((s) => s.draftDeckMissionIds);
  const gameResult = useSocketStore((s) => s.gameResult);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [draftDeckName, setDraftDeckName] = useState('');
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveAttempted = useRef(false);

  const handleSaveReplay = useCallback(async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');

    try {
      if (isAIGame && gameState) {
        // AI game: create game record + save replay data
        const replayData = {
          log: gameState.log,
          playerNames: playerDisplayNames,
          finalMissions: gameState.activeMissions.map(m => ({
            name_fr: m.card.name_fr,
            rank: m.rank,
            basePoints: m.basePoints,
            rankBonus: m.rankBonus,
            wonBy: m.wonBy ?? null,
          })),
          // Visual replay data
          initialState: replayInitialState,
          actionHistory: gameState.actionHistory ?? [],
        };

        const aiDifficulty = gameState.player2.isAI
          ? gameState.player2.aiDifficulty
          : gameState.player1.aiDifficulty;

        // Step 1: Create game record
        const createRes = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isAiGame: true, aiDifficulty: aiDifficulty ?? 'medium' }),
        });
        if (!createRes.ok) throw new Error('Failed to create game');
        const game = await createRes.json();

        // Step 2: Complete with replay data
        const completeRes = await fetch('/api/game', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            winnerId: winner === 'player1' ? session?.user?.id : null,
            player1Score: gameState.player1.missionPoints,
            player2Score: gameState.player2.missionPoints,
            gameLog: replayData,
          }),
        });
        if (!completeRes.ok) throw new Error('Failed to save replay');

        setSavedGameId(game.id);
        setSaveState('saved');
      } else if (isOnlineGame && gameResult?.gameId && gameResult?.replayData) {
        // Online game: PATCH existing game record with replay data
        const res = await fetch(`/api/game/${gameResult.gameId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameState: gameResult.replayData }),
        });
        if (!res.ok) throw new Error('Failed to save replay');

        setSavedGameId(gameResult.gameId);
        setSaveState('saved');
      } else {
        throw new Error('No replay data available');
      }
    } catch {
      setSaveState('error');
    }
  }, [saveState, isAIGame, isOnlineGame, gameState, gameResult, playerDisplayNames, winner, session?.user?.id, replayInitialState]);

  // Auto-save when the end screen appears (if logged in and has replay data)
  useEffect(() => {
    if (!gameOver || autoSaveAttempted.current) return;
    const isLoggedIn = !!session?.user?.id;
    const hasReplayData = isAIGame
      ? !!gameState?.log?.length
      : !!(gameResult?.gameId && gameResult?.replayData);
    if (isLoggedIn && hasReplayData) {
      autoSaveAttempted.current = true;
      handleSaveReplay();
    }
  }, [gameOver, session?.user?.id, isAIGame, gameState, gameResult, handleSaveReplay]);

  const handleSaveDraftDeck = useCallback(async () => {
    if (draftSaveState === 'saving' || draftSaveState === 'saved') return;
    if (!draftDeckCardIds || !draftDeckMissionIds) return;

    setDraftSaveState('saving');
    try {
      const name = draftDeckName.trim() || 'Draft Deck';
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          cardIds: draftDeckCardIds,
          missionIds: draftDeckMissionIds,
        }),
      });
      if (res.ok) {
        setDraftSaveState('saved');
      } else {
        setDraftSaveState('error');
        setTimeout(() => setDraftSaveState('idle'), 2000);
      }
    } catch {
      setDraftSaveState('error');
      setTimeout(() => setDraftSaveState('idle'), 2000);
    }
  }, [draftSaveState, draftDeckCardIds, draftDeckMissionIds, draftDeckName]);

  if (!gameOver || !visibleState) return null;

  const isRanked = isOnlineGame && gameResult?.isRanked;
  const eloDelta = gameResult?.eloDelta;
  const winReason = gameResult?.winReason;

  const myPlayer = visibleState.myPlayer;
  const playerWon = winner === myPlayer;
  const isDraw = winner === null;
  const isForfeit = winReason === 'forfeit' || winReason === 'timeout';

  const myScore = visibleState.myState.missionPoints;
  const oppScore = visibleState.opponentState.missionPoints;

  // Check if the forfeit was by the viewing player or the opponent
  const forfeitedByMe = isForfeit && visibleState.forfeitedBy === myPlayer;

  let headingText: string;
  let headingColor: string;
  if (isForfeit) {
    if (forfeitedByMe) {
      headingText = winReason === 'timeout' ? t('game.end.youTimedOut') : t('game.end.youAbandoned');
      headingColor = '#b33e3e';
    } else {
      headingText = winReason === 'timeout' ? t('game.end.opponentTimedOut') : t('game.end.opponentAbandoned');
      headingColor = '#c4a35a';
    }
  } else if (isDraw) {
    headingText = t('game.end.draw');
    headingColor = '#888888';
  } else if (playerWon) {
    headingText = t('game.end.victory');
    headingColor = '#c4a35a';
  } else {
    headingText = t('game.end.defeat');
    headingColor = '#b33e3e';
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'spring',
            stiffness: 150,
            damping: 15,
            delay: 0.2,
          }}
          className="flex flex-col items-center gap-8 rounded-xl p-12"
          style={{
            backgroundColor: 'rgba(8, 8, 12, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 16px 64px rgba(0, 0, 0, 0.7)',
            minWidth: '420px',
          }}
        >
          {/* Dramatic heading */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="flex flex-col items-center gap-2"
          >
            <motion.span
              className="text-5xl font-bold tracking-widest uppercase"
              style={{ color: headingColor }}
              animate={{
                textShadow: [
                  `0 0 20px ${headingColor}40`,
                  `0 0 40px ${headingColor}60`,
                  `0 0 20px ${headingColor}40`,
                ],
              }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {headingText}
            </motion.span>
            <motion.div
              className="h-px w-32"
              style={{ backgroundColor: headingColor }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            />
          </motion.div>

          {/* Score comparison */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-8"
          >
            {/* Player score */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm" style={{ color: '#888888' }}>
                {t('game.you')}
              </span>
              <motion.span
                className="text-4xl font-bold tabular-nums"
                style={{ color: '#c4a35a' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.0, type: 'spring', stiffness: 200 }}
              >
                {myScore}
              </motion.span>
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.score')}
              </span>
            </div>

            {/* Separator */}
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-2xl font-bold"
                style={{ color: '#333333' }}
              >
                -
              </span>
            </div>

            {/* Opponent score */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm" style={{ color: '#888888' }}>
                {t('game.opponent')}
              </span>
              <motion.span
                className="text-4xl font-bold tabular-nums"
                style={{ color: '#b33e3e' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.2, type: 'spring', stiffness: 200 }}
              >
                {oppScore}
              </motion.span>
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.score')}
              </span>
            </div>
          </motion.div>

          {/* Edge token winner note */}
          {isDraw && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="text-xs"
              style={{ color: '#888888' }}
            >
              {t('game.end.tieBreaker')}
            </motion.span>
          )}

          {/* ELO change for ranked matches */}
          {isRanked && eloDelta != null && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4 }}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
                {t('game.end.rankedMatch')}
              </span>
              <span
                className="text-lg font-bold tabular-nums"
                style={{ color: eloDelta >= 0 ? '#4a9e4a' : '#b33e3e' }}
              >
                {eloDelta >= 0 ? '+' : ''}{eloDelta} ELO
              </span>
            </motion.div>
          )}

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="flex flex-col items-center gap-3"
          >
            {/* Auto-save status */}
            {saveState === 'saving' && (
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.end.savingReplay')}
              </span>
            )}
            {saveState === 'error' && (
              <span className="text-xs" style={{ color: '#b33e3e' }}>
                {t('game.end.saveError')}
              </span>
            )}

            {/* Watch Replay button (after auto-save) */}
            {saveState === 'saved' && savedGameId && (
              <>
                <span className="text-xs" style={{ color: '#4a9e4a' }}>
                  {t('game.end.replaySaved')}
                </span>
                <Link
                  href={`/replay/${savedGameId}`}
                  className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider text-center"
                  style={{
                    backgroundColor: '#1a1a2e',
                    color: '#4a9e4a',
                    border: '1px solid #4a9e4a',
                  }}
                >
                  {t('game.end.watchReplay')}
                </Link>
              </>
            )}

            {/* Save Draft Deck */}
            {!!session?.user?.id && draftDeckCardIds && draftDeckMissionIds && draftSaveState !== 'saved' && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
                  {t('draft.saveDeck')}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draftDeckName}
                    onChange={(e) => setDraftDeckName(e.target.value)}
                    placeholder={t('draft.saveDeckPlaceholder')}
                    className="px-3 py-2 text-sm rounded"
                    style={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      color: '#e0e0e0',
                      outline: 'none',
                      width: '200px',
                    }}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSaveDraftDeck}
                    disabled={draftSaveState === 'saving'}
                    className="px-4 py-2 rounded text-sm font-medium uppercase tracking-wider cursor-pointer"
                    style={{
                      backgroundColor: draftSaveState === 'error' ? '#b33e3e' : '#1a1a2e',
                      color: draftSaveState === 'error' ? '#ffffff' : '#c4a35a',
                      border: `1px solid ${draftSaveState === 'error' ? '#b33e3e' : '#c4a35a'}`,
                      opacity: draftSaveState === 'saving' ? 0.6 : 1,
                    }}
                  >
                    {draftSaveState === 'saving'
                      ? t('common.loading')
                      : draftSaveState === 'error'
                        ? t('draft.deckSaveError')
                        : t('common.save')}
                  </motion.button>
                </div>
              </div>
            )}

            {/* Draft deck saved confirmation */}
            {draftSaveState === 'saved' && (
              <span className="text-xs" style={{ color: '#4a9e4a' }}>
                {t('draft.deckSaved')}
              </span>
            )}

            {/* Back to Menu button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={resetGame}
              className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
              style={{
                backgroundColor: '#c4a35a',
                color: '#0a0a0a',
                border: '1px solid #c4a35a',
                boxShadow: '0 4px 16px rgba(196, 163, 90, 0.3)',
              }}
            >
              {t('game.end.backToMenu')}
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
