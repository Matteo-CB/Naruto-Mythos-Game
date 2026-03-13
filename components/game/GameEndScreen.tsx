'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { EloBadge, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupActionButton,
  PopupDismissLink,
  SectionDivider,
} from './PopupPrimitives';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function GameEndScreen() {
  const t = useTranslations();
  const router = useRouter();
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
  const sealedDeckCardIds = useGameStore((s) => s.sealedDeckCardIds);
  const sealedDeckMissionIds = useGameStore((s) => s.sealedDeckMissionIds);
  const gameResult = useSocketStore((s) => s.gameResult);
  const rematchState = useSocketStore((s) => s.rematchState);
  const offerRematch = useSocketStore((s) => s.offerRematch);
  const acceptRematch = useSocketStore((s) => s.acceptRematch);
  const declineRematch = useSocketStore((s) => s.declineRematch);
  const replayAIGame = useGameStore((s) => s.replayAIGame);
  const lastAIGameConfig = useGameStore((s) => s.lastAIGameConfig);

  const handleChangeDeck = useCallback(() => {
    resetGame();
    router.push('/play/ai');
  }, [resetGame, router]);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [sealedDeckName, setSealedDeckName] = useState('');
  const [sealedSaveState, setSealedSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveAttempted = useRef(false);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setLeaguesEnabled(data.leaguesEnabled ?? false))
      .catch(() => {});
  }, []);

  const handleSaveReplay = useCallback(async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');

    try {
      if (isAIGame && gameState) {
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
          initialState: replayInitialState,
          actionHistory: gameState.actionHistory ?? [],
        };

        const aiDifficulty = gameState.player2.isAI
          ? gameState.player2.aiDifficulty
          : gameState.player1.aiDifficulty;

        const createRes = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isAiGame: true, aiDifficulty: aiDifficulty ?? 'medium' }),
        });
        if (!createRes.ok) throw new Error('Failed to create game');
        const game = await createRes.json();

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

  const handleSaveSealedDeck = useCallback(async () => {
    if (sealedSaveState === 'saving' || sealedSaveState === 'saved') return;
    if (!sealedDeckCardIds || !sealedDeckMissionIds) return;

    setSealedSaveState('saving');
    try {
      const name = sealedDeckName.trim() || t('sealed.saveDeckPlaceholder');
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          cardIds: sealedDeckCardIds,
          missionIds: sealedDeckMissionIds,
        }),
      });
      if (res.ok) {
        setSealedSaveState('saved');
      } else {
        setSealedSaveState('error');
        setTimeout(() => setSealedSaveState('idle'), 2000);
      }
    } catch {
      setSealedSaveState('error');
      setTimeout(() => setSealedSaveState('idle'), 2000);
    }
  }, [sealedSaveState, sealedDeckCardIds, sealedDeckMissionIds, sealedDeckName]);

  if (!gameOver || !visibleState) return null;

  const isRanked = isOnlineGame && gameResult?.isRanked;
  const eloDelta = gameResult?.eloDelta;
  const newElo = gameResult?.newElo;
  const totalGames = gameResult?.totalGames;
  const winReason = gameResult?.winReason;
  const isPlacement = totalGames !== undefined && totalGames < PLACEMENT_MATCHES_REQUIRED;
  const justBecameRanked = totalGames !== undefined && totalGames === PLACEMENT_MATCHES_REQUIRED;

  const myPlayer = visibleState.myPlayer;
  const playerWon = winner === myPlayer;
  const isDraw = winner === null;
  const isForfeit = winReason === 'forfeit' || winReason === 'timeout';

  const myScore = visibleState.myState.missionPoints;
  const oppScore = visibleState.opponentState.missionPoints;

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
      <PopupOverlay>
        <PopupCornerFrame
          accentColor={`${headingColor}60`}
          maxWidth="520px"
          padding="40px 32px"
        >
          {/* Dramatic heading */}
          <PopupTitle accentColor={headingColor} size="xl">
            {headingText}
          </PopupTitle>

          {/* Score comparison */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-8 mb-6"
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

            {/* Vertical divider */}
            <div
              style={{
                width: '1px',
                height: '48px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              }}
            />

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
              className="text-xs text-center block mb-4"
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
              className="flex flex-col items-center gap-2 mb-4"
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

              {leaguesEnabled && newElo !== undefined && (
                <div className="flex flex-col items-center gap-2 mt-1">
                  <EloBadge elo={newElo} size="md" showElo totalGames={totalGames} />
                </div>
              )}

              {leaguesEnabled && isPlacement && totalGames !== undefined && (
                <div className="flex flex-col items-center gap-1 mt-1">
                  <span className="text-xs" style={{ color: '#999' }}>
                    {t('game.end.placementMatch', { current: totalGames, total: PLACEMENT_MATCHES_REQUIRED })}
                  </span>
                  <div
                    className="overflow-hidden"
                    style={{ width: '120px', height: '4px', backgroundColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${(totalGames / PLACEMENT_MATCHES_REQUIRED) * 100}%`,
                        backgroundColor: '#666',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {leaguesEnabled && justBecameRanked && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 2.0, type: 'spring' }}
                  className="text-sm font-bold uppercase tracking-wider mt-1"
                  style={{ color: '#c4a35a' }}
                >
                  {t('game.end.nowRanked')}
                </motion.span>
              )}
            </motion.div>
          )}

          <SectionDivider color="rgba(255, 255, 255, 0.06)" width={100} />

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="flex flex-col items-center gap-3 mt-4"
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

            {/* Watch Replay button */}
            {saveState === 'saved' && savedGameId && (
              <>
                <span className="text-xs" style={{ color: '#4a9e4a' }}>
                  {t('game.end.replaySaved')}
                </span>
                <Link
                  href={`/replay/${savedGameId}`}
                  className="uppercase tracking-wider text-center text-sm font-bold no-underline"
                  style={{
                    padding: '10px 28px',
                    backgroundColor: 'rgba(74, 158, 74, 0.12)',
                    color: '#4a9e4a',
                    borderLeft: '3px solid #4a9e4a',
                    transform: 'skewX(-3deg)',
                    display: 'inline-block',
                    letterSpacing: '0.12em',
                  }}
                >
                  <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
                    {t('game.end.watchReplay')}
                  </span>
                </Link>
              </>
            )}

            {/* Save Sealed Deck */}
            {!!session?.user?.id && sealedDeckCardIds && sealedDeckMissionIds && sealedSaveState !== 'saved' && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
                  {t('sealed.saveDeck')}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sealedDeckName}
                    onChange={(e) => setSealedDeckName(e.target.value)}
                    placeholder={t('sealed.saveDeckPlaceholder')}
                    className="px-3 py-2 text-sm"
                    style={{
                      backgroundColor: '#0a0a0f',
                      border: '1px solid rgba(196, 163, 90, 0.2)',
                      borderLeft: '3px solid rgba(196, 163, 90, 0.4)',
                      color: '#e0e0e0',
                      outline: 'none',
                      width: '200px',
                    }}
                  />
                  <PopupActionButton
                    onClick={handleSaveSealedDeck}
                    disabled={sealedSaveState === 'saving'}
                    accentColor={sealedSaveState === 'error' ? '#b33e3e' : '#c4a35a'}
                  >
                    {sealedSaveState === 'saving'
                      ? t('common.loading')
                      : sealedSaveState === 'error'
                        ? t('sealed.deckSaveError')
                        : t('common.save')}
                  </PopupActionButton>
                </div>
              </div>
            )}

            {sealedSaveState === 'saved' && (
              <span className="text-xs" style={{ color: '#4a9e4a' }}>
                {t('sealed.deckSaved')}
              </span>
            )}

            {/* AI Replay buttons */}
            {isAIGame && lastAIGameConfig && (
              <div className="flex gap-3">
                <PopupActionButton onClick={replayAIGame} accentColor="#c4a35a">
                  {t('game.end.replay')}
                </PopupActionButton>
                <PopupDismissLink onClick={handleChangeDeck}>
                  {t('game.end.changeDeck')}
                </PopupDismissLink>
              </div>
            )}

            {/* Online Rematch button */}
            {isOnlineGame && rematchState === 'none' && (
              <PopupActionButton onClick={offerRematch} accentColor="#c4a35a">
                {t('game.end.rematch')}
              </PopupActionButton>
            )}

            {isOnlineGame && rematchState === 'offered' && (
              <span className="text-xs" style={{ color: '#c4a35a' }}>
                {t('game.end.rematchWaiting')}
              </span>
            )}

            {isOnlineGame && rematchState === 'received' && (
              <div className="flex gap-3">
                <PopupActionButton onClick={acceptRematch} accentColor="#4a9e4a">
                  {t('game.end.rematchAccept')}
                </PopupActionButton>
                <PopupActionButton onClick={declineRematch} accentColor="#b33e3e">
                  {t('game.end.rematchDecline')}
                </PopupActionButton>
              </div>
            )}

            {isOnlineGame && rematchState === 'declined' && (
              <span className="text-xs" style={{ color: '#b33e3e' }}>
                {t('game.end.rematchDeclined')}
              </span>
            )}

            {/* Back to Menu button */}
            <PopupActionButton onClick={resetGame} accentColor="#c4a35a">
              {t('game.end.backToMenu')}
            </PopupActionButton>
          </motion.div>
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
