'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useSocketStore } from '@/lib/socket/client';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';

export function ActionBar() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const performAction = useGameStore((s) => s.performAction);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const actionError = useGameStore((s) => s.actionError);
  const actionErrorKey = useGameStore((s) => s.actionErrorKey);
  const actionErrorParams = useGameStore((s) => s.actionErrorParams);
  const clearActionError = useGameStore((s) => s.clearActionError);
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);
  const endAIGameAsForfeit = useGameStore((s) => s.endAIGameAsForfeit);

  const selectedCardIndex = useUIStore((s) => s.selectedCardIndex);
  const selectedMissionIndex = useUIStore((s) => s.selectedMissionIndex);
  const selectedTargetId = useUIStore((s) => s.selectedTargetId);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const socketForfeit = useSocketStore((s) => s.forfeit);
  const actionDeadline = useSocketStore((s) => s.actionDeadline);

  if (!visibleState) return null;

  const {
    phase,
    activePlayer,
    myPlayer,
    myState,
  } = visibleState;

  const isMyTurn = activePlayer === myPlayer && !isProcessing;
  const isActionPhase = phase === 'action';
  const hasPassed = myState.hasPassed;

  // Determine available actions
  const hasCardSelected = selectedCardIndex !== null;
  const hasMissionSelected = selectedMissionIndex !== null;
  const hasTargetSelected = selectedTargetId !== null;
  const cardAndMissionReady = hasCardSelected && hasMissionSelected;

  // Get selected card info
  const selectedCard =
    hasCardSelected && selectedCardIndex < myState.hand.length
      ? myState.hand[selectedCardIndex]
      : null;

  // Compute effective cost when card + mission are selected (accounts for Tayuya, Kurenai, etc.)
  const effectiveCost = useMemo(() => {
    if (!selectedCard || selectedMissionIndex === null || !visibleState) return selectedCard?.chakra ?? 0;
    try {
      return calculateEffectiveCost(visibleState, myPlayer, selectedCard, selectedMissionIndex, false);
    } catch {
      return selectedCard.chakra;
    }
  }, [selectedCard, selectedMissionIndex, visibleState, myPlayer]);

  const baseCost = selectedCard?.chakra ?? 0;
  const costModifier = effectiveCost - baseCost;
  const costLabel = costModifier !== 0
    ? `${baseCost}${costModifier > 0 ? '+' : ''}${costModifier}`
    : `${baseCost}`;

  const canAffordCard = selectedCard ? myState.chakra >= effectiveCost : false;
  const canAffordHidden = myState.chakra >= 1;

  // Compute upgrade targets: same name (or flexible upgrade), strictly lower cost, on selected mission
  const upgradeTargets = useMemo(() => {
    if (!selectedCard || selectedMissionIndex === null || !visibleState?.activeMissions) return [];
    const mission = visibleState.activeMissions[selectedMissionIndex];
    if (!mission) return [];
    const myChars = myPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
    return myChars.filter(c => {
      if (c.controlledBy !== myPlayer) return false;
      // Use topCard (top of evolution stack) for correct name/cost after prior upgrades
      const charCard = c.topCard ?? c.card;
      if (!charCard) return false;
      const sameNameMatch = charCard.name_fr.toUpperCase() === selectedCard.name_fr.toUpperCase();
      // Flexible upgrade: Orochimaru 051/138 can upgrade over non-Summon, non-Orochimaru
      const isFlexible = (selectedCard.number === 51 || selectedCard.number === 138)
        && (selectedCard.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('upgrade'))
        && !(charCard.keywords ?? []).includes('Summon')
        && !charCard.name_fr.toUpperCase().includes('OROCHIMARU');
      // Akamaru 029 can upgrade over Kiba Inuzuka
      const isAkamaruUpgrade = selectedCard.number === 29
        && (selectedCard.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('Kiba Inuzuka'))
        && charCard.name_fr.toUpperCase().includes('KIBA INUZUKA');
      // Ichibi 076 can upgrade any Gaara
      const isIchibiUpgrade = selectedCard.number === 76
        && (selectedCard.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('[⧗]'))
        && charCard.name_fr.toUpperCase() === 'GAARA';
      // Ukon 063/124 can upgrade any Sound Village character
      const isUkonUpgrade = (selectedCard.number === 63 || selectedCard.number === 124)
        && (selectedCard.effects ?? []).some(e => e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'))
        && (charCard.group ?? '') === 'Sound Village';

      const nameOk = sameNameMatch || isFlexible || isAkamaruUpgrade || isIchibiUpgrade || isUkonUpgrade;
      return nameOk && charCard.chakra < selectedCard.chakra;
    });
  }, [selectedCard, selectedMissionIndex, visibleState?.activeMissions, myPlayer]);

  // Can reveal: need a hidden character selected as target
  const canReveal = isMyTurn && isActionPhase && hasTargetSelected && !hasPassed;

  // Determine chakra cost for reveal (checks if reveal would be an upgrade — pays only the difference)
  let revealCost = 0;
  let isRevealUpgrade = false;
  if (hasTargetSelected && visibleState.activeMissions) {
    for (const m of visibleState.activeMissions) {
      const myChars =
        myPlayer === 'player1' ? m.player1Characters : m.player2Characters;
      const target = myChars.find((c) => c.instanceId === selectedTargetId);
      if (target && target.isHidden && target.card) {
        const hiddenTopCard = target.topCard ?? target.card;
        // Check if there's a visible same-name character with lower cost on the same mission (upgrade)
        const upgradeOver = myChars.find((c) => {
          if (c.instanceId === selectedTargetId || c.isHidden) return false;
          const cTop = c.topCard ?? c.card;
          if (!cTop) return false;
          return cTop.name_fr.toUpperCase() === hiddenTopCard.name_fr.toUpperCase()
            && hiddenTopCard.chakra > cTop.chakra;
        });
        if (upgradeOver) {
          const existingTop = upgradeOver.topCard ?? upgradeOver.card;
          revealCost = hiddenTopCard.chakra - (existingTop?.chakra ?? 0);
          isRevealUpgrade = true;
        } else {
          revealCost = hiddenTopCard.chakra;
        }
        break;
      }
    }
  }
  const canAffordReveal = myState.chakra >= revealCost;

  // Handlers
  const handlePlayVisible = () => {
    if (!cardAndMissionReady || !canAffordCard || !isMyTurn || hasPassed) return;
    clearActionError();
    performAction({
      type: 'PLAY_CHARACTER',
      cardIndex: selectedCardIndex!,
      missionIndex: selectedMissionIndex!,
      hidden: false,
    });
    // Only clear selection if no error (action was accepted)
    const error = useGameStore.getState().actionError;
    if (!error) clearSelection();
  };

  const handlePlayHidden = () => {
    if (!cardAndMissionReady || !canAffordHidden || !isMyTurn || hasPassed) return;
    clearActionError();
    performAction({
      type: 'PLAY_HIDDEN',
      cardIndex: selectedCardIndex!,
      missionIndex: selectedMissionIndex!,
    });
    const error = useGameStore.getState().actionError;
    if (!error) clearSelection();
  };

  const handleReveal = () => {
    if (!canReveal || !canAffordReveal || !selectedTargetId) {
      console.warn('[ActionBar] handleReveal blocked:', { canReveal, canAffordReveal, selectedTargetId });
      return;
    }
    // Find which mission the target is on
    let targetMissionIndex = -1;
    if (visibleState.activeMissions) {
      for (let i = 0; i < visibleState.activeMissions.length; i++) {
        const m = visibleState.activeMissions[i];
        const myChars =
          myPlayer === 'player1' ? m.player1Characters : m.player2Characters;
        if (myChars.find((c) => c.instanceId === selectedTargetId)) {
          targetMissionIndex = i;
          break;
        }
      }
    }
    if (targetMissionIndex >= 0) {
      performAction({
        type: 'REVEAL_CHARACTER',
        missionIndex: targetMissionIndex,
        characterInstanceId: selectedTargetId,
      });
    } else {
      console.warn('[ActionBar] handleReveal: character not found in any mission', { selectedTargetId });
    }
    clearSelection();
  };

  const handleUpgrade = (targetInstanceId: string) => {
    if (!cardAndMissionReady || !isMyTurn || hasPassed || selectedMissionIndex === null) return;
    clearActionError();
    performAction({
      type: 'UPGRADE_CHARACTER',
      cardIndex: selectedCardIndex!,
      missionIndex: selectedMissionIndex,
      targetInstanceId,
    });
    const error = useGameStore.getState().actionError;
    if (!error) clearSelection();
  };

  const handlePass = () => {
    if (!isMyTurn || !isActionPhase || hasPassed) return;
    performAction({ type: 'PASS' });
    clearSelection();
  };

  const handleCancel = () => {
    clearActionError();
    clearSelection();
  };

  const confirmAbandon = () => {
    setShowAbandonConfirm(false);
    if (isOnlineGame) {
      socketForfeit('abandon');
    } else {
      endAIGameAsForfeit();
    }
  };

  // Don't show during non-action phases (except a minimal display + abandon button)
  if (!isActionPhase) {
    return (
      <>
        <div
          className="flex items-center justify-center gap-2 py-1.5 px-4 rounded-full"
          style={{
            backgroundColor: 'rgba(10, 10, 14, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <span className="text-xs" style={{ color: '#888888' }}>
            {phase === 'mulligan'
              ? t('game.mulligan.description')
              : phase === 'start'
                ? `${t('game.phase.start')}...`
                : phase === 'mission'
                  ? `${t('game.phase.mission')}...`
                  : phase === 'end'
                    ? `${t('game.phase.end')}...`
                    : ''}
          </span>
          {isOnlineGame && (
            <ActionButton
              label={t('game.actions.abandon')}
              onClick={() => setShowAbandonConfirm(true)}
              disabled={false}
              variant="danger"
            />
          )}
        </div>
        <AnimatePresence>
          {showAbandonConfirm && (
            <AbandonConfirmDialog
              onConfirm={confirmAbandon}
              onCancel={() => setShowAbandonConfirm(false)}
              t={t}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center justify-center gap-2 py-2 px-4 rounded-full"
      style={{
        backgroundColor: 'rgba(10, 10, 14, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Status text */}
      {!isMyTurn && (
        <span className="text-xs" style={{ color: '#888888' }}>
          {t('game.opponentTurn')}
        </span>
      )}

      {isMyTurn && hasPassed && (
        <span className="text-xs" style={{ color: '#888888' }}>
          {t('game.processing')}
        </span>
      )}

      {isMyTurn && !hasPassed && (
        <>
          {/* Action error message */}
          {actionError && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ color: '#ff6b6b', backgroundColor: 'rgba(179, 62, 62, 0.15)' }}
            >
              {actionErrorKey ? t(actionErrorKey, actionErrorParams ?? {}) : actionError}
            </motion.span>
          )}

          {/* Selection hint */}
          {!actionError && !hasCardSelected && !hasTargetSelected && (
            <span className="text-xs" style={{ color: '#888888' }}>
              {t('game.selectTarget')}
            </span>
          )}

          {!actionError && hasCardSelected && !hasMissionSelected && (
            <span className="text-xs" style={{ color: '#888888' }}>
              {t('game.selectMission')}
            </span>
          )}

          {/* Upgrade button(s) — shown first when available */}
          {cardAndMissionReady && upgradeTargets.map((target) => {
            const charCard = target.topCard ?? target.card;
            const upgradeCost = (selectedCard?.chakra ?? 0) - (charCard?.chakra ?? 0);
            const canAffordUpgrade = myState.chakra >= upgradeCost;
            const targetName = charCard?.name_fr ?? '';
            return (
              <ActionButton
                key={target.instanceId}
                label={`${t('game.actions.upgrade')} ${targetName} (${upgradeCost} ${t('game.chakra').toLowerCase()})`}
                onClick={() => handleUpgrade(target.instanceId)}
                disabled={!canAffordUpgrade}
                variant="primary"
              />
            );
          })}

          {/* Play visible button — secondary when upgrade targets exist */}
          {cardAndMissionReady && (
            <ActionButton
              label={`${t('game.play')} (${costLabel} ${t('game.chakra').toLowerCase()})`}
              onClick={handlePlayVisible}
              disabled={!canAffordCard}
              variant={upgradeTargets.length > 0 ? "secondary" : "primary"}
            />
          )}

          {/* Play hidden button */}
          {cardAndMissionReady && (
            <ActionButton
              label={t('game.actions.playHiddenCharacter')}
              onClick={handlePlayHidden}
              disabled={!canAffordHidden}
              variant="secondary"
            />
          )}

          {/* Reveal button */}
          {canReveal && (
            <ActionButton
              label={isRevealUpgrade
                ? `${t('game.reveal')} + ${t('game.actions.upgrade')} (${revealCost} ${t('game.chakra').toLowerCase()})`
                : `${t('game.reveal')} (${revealCost} ${t('game.chakra').toLowerCase()})`}
              onClick={handleReveal}
              disabled={!canAffordReveal}
              variant="primary"
            />
          )}

          {/* Cancel selection */}
          {(hasCardSelected || hasTargetSelected || hasMissionSelected) && (
            <ActionButton
              label={t('common.cancel')}
              onClick={handleCancel}
              disabled={false}
              variant="danger"
            />
          )}

          {/* Timer display (online only) */}
          {isOnlineGame && isMyTurn && actionDeadline && (
            <ActionTimer deadline={actionDeadline} />
          )}

          {/* Pass button */}
          <ActionButton
            label={t('game.pass')}
            onClick={handlePass}
            disabled={false}
            variant="muted"
          />
        </>
      )}

      {/* Abandon button (always visible in online games during action phase) */}
      {isOnlineGame && (
        <ActionButton
          label={t('game.actions.abandon')}
          onClick={() => setShowAbandonConfirm(true)}
          disabled={false}
          variant="danger"
        />
      )}

      {/* Abandon confirmation dialog */}
      <AnimatePresence>
        {showAbandonConfirm && (
          <AbandonConfirmDialog
            onConfirm={confirmAbandon}
            onCancel={() => setShowAbandonConfirm(false)}
            t={t}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ----- Button sub-component -----

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'muted';

const variantStyles: Record<
  ButtonVariant,
  {
    bg: string;
    bgHover: string;
    border: string;
    text: string;
    textDisabled: string;
  }
> = {
  primary: {
    bg: '#c4a35a',
    bgHover: '#d4b36a',
    border: '#c4a35a',
    text: '#0a0a0a',
    textDisabled: '#555555',
  },
  secondary: {
    bg: 'rgba(196, 163, 90, 0.1)',
    bgHover: 'rgba(196, 163, 90, 0.18)',
    border: 'rgba(196, 163, 90, 0.4)',
    text: '#c4a35a',
    textDisabled: '#555555',
  },
  danger: {
    bg: 'rgba(179, 62, 62, 0.1)',
    bgHover: 'rgba(179, 62, 62, 0.18)',
    border: 'rgba(179, 62, 62, 0.4)',
    text: '#b33e3e',
    textDisabled: '#555555',
  },
  muted: {
    bg: 'rgba(255, 255, 255, 0.04)',
    bgHover: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#888888',
    textDisabled: '#444444',
  },
};

function ActionButton({
  label,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant: ButtonVariant;
}) {
  const styles = variantStyles[variant];

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.04 }}
      whileTap={disabled ? {} : { scale: 0.96 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="px-4 py-1.5 rounded-md text-xs font-medium cursor-pointer"
      style={{
        backgroundColor: disabled ? 'rgba(255, 255, 255, 0.02)' : styles.bg,
        border: `1px solid ${disabled ? 'rgba(255, 255, 255, 0.05)' : styles.border}`,
        color: disabled ? styles.textDisabled : styles.text,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
    >
      {label}
    </motion.button>
  );
}

// ----- Timer component -----

function ActionTimer({ deadline }: { deadline: number }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  );

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isWarning = secondsLeft <= 30;

  return (
    <motion.span
      className="text-xs font-bold tabular-nums px-2 py-0.5 rounded"
      style={{
        color: isWarning ? '#b33e3e' : '#888888',
        backgroundColor: isWarning ? 'rgba(179, 62, 62, 0.12)' : 'transparent',
      }}
      animate={isWarning ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
      transition={isWarning ? { repeat: Infinity, duration: 1 } : {}}
    >
      {minutes}:{seconds.toString().padStart(2, '0')}
    </motion.span>
  );
}

// ----- Abandon confirmation dialog -----

function AbandonConfirmDialog({
  onConfirm,
  onCancel,
  t,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-4 rounded-xl p-8"
        style={{
          backgroundColor: 'rgba(8, 8, 12, 0.95)',
          border: '1px solid rgba(179, 62, 62, 0.3)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 16px 64px rgba(0, 0, 0, 0.7)',
          minWidth: '320px',
        }}
      >
        <span className="text-lg font-bold" style={{ color: '#e0e0e0' }}>
          {t('game.actions.abandonConfirmTitle')}
        </span>
        <span className="text-sm" style={{ color: '#888888' }}>
          {t('game.actions.abandonConfirmMessage')}
        </span>
        <div className="flex gap-3 mt-2">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onConfirm}
            className="px-6 py-2 rounded-md text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: 'rgba(179, 62, 62, 0.2)',
              border: '1px solid rgba(179, 62, 62, 0.5)',
              color: '#b33e3e',
            }}
          >
            {t('game.actions.abandonConfirm')}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onCancel}
            className="px-6 py-2 rounded-md text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#888888',
            }}
          >
            {t('game.actions.abandonCancel')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
