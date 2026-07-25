'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { localizeMessageParams } from '@/lib/i18n/localizeMessageParams';
import { getCardName } from '@/lib/utils/cardLocale';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useSocketStore } from '@/lib/socket/client';
import { calculateEffectiveCost, hasKurenai034CostReduction } from '@/lib/engine/rules/ChakraValidation';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { useGameScale } from './GameScaleContext';

export function ActionBar() {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
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
  const [confirmingPass, setConfirmingPass] = useState(false);
  const socketForfeit = useSocketStore((s) => s.forfeit);

  const effectPopupMinimized = useUIStore((s) => s.effectPopupMinimized);
  const pendingTargetSelection = useGameStore((s) => s.pendingTargetSelection);

  useEffect(() => {
    setConfirmingPass(false);
  }, [visibleState?.phase, visibleState?.activePlayer]);

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
  const actionsBlocked = effectPopupMinimized && pendingTargetSelection !== null;

  const hasCardSelected = selectedCardIndex !== null;
  const hasMissionSelected = selectedMissionIndex !== null;
  const hasTargetSelected = selectedTargetId !== null;
  const cardAndMissionReady = hasCardSelected && hasMissionSelected;

  const selectedCard =
    hasCardSelected && selectedCardIndex < myState.hand.length
      ? myState.hand[selectedCardIndex]
      : null;

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

  const upgradeTargets = useMemo(() => {
    if (!selectedCard || selectedMissionIndex === null || !visibleState?.activeMissions) return [];
    const mission = visibleState.activeMissions[selectedMissionIndex];
    if (!mission) return [];
    const myChars = myPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
    return myChars.filter(c => {
      if (c.controlledBy !== myPlayer) return false;
      if (c.controlledBy !== c.originalOwner) return false;
      if (c.isHidden) return false;
      
      const charCard = c.topCard ?? c.card;
      if (!charCard) return false;
      let sameNameMatch = charCard.name_fr.toUpperCase() === selectedCard.name_fr.toUpperCase();
      
      const hasFlexRestriction = (selectedCard.number === 51 || selectedCard.number === 138)
        && (selectedCard.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('upgrade'));
      const isFlexible = hasFlexRestriction
        && !(charCard.keywords ?? []).includes('Summon')
        && !charCard.name_fr.toUpperCase().includes('OROCHIMARU');
      
      if (hasFlexRestriction && (
        (charCard.keywords ?? []).includes('Summon') || charCard.name_fr.toUpperCase().includes('OROCHIMARU')
      )) {
        sameNameMatch = false;
      }
      
      const isAkamaruUpgrade = selectedCard.number === 29
        && (selectedCard.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('Kiba Inuzuka'))
        && charCard.name_fr.toUpperCase().includes('KIBA INUZUKA');
      
      const isIchibiUpgrade = selectedCard.number === 76
        && (selectedCard.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('[⧗]'))
        && charCard.name_fr.toUpperCase() === 'GAARA';
      
      const isUkonUpgrade = (selectedCard.number === 63 || selectedCard.number === 124)
        && (selectedCard.effects ?? []).some(e => e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'))
        && (charCard.group ?? '').toLowerCase().includes('sound');
      
      const isKyubiUpgrade = selectedCard.number === 129
        && charCard.name_fr.toUpperCase().includes('NARUTO');
      
      const isSakonUpgrade = selectedCard.number === 127
        && (selectedCard.effects ?? []).some(e => e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'))
        && (charCard.group ?? '').toLowerCase().includes('sound');

      const isFlexUpgrade = isFlexible || isAkamaruUpgrade || isIchibiUpgrade || isUkonUpgrade || isKyubiUpgrade || isSakonUpgrade;
      const nameOk = sameNameMatch || isFlexUpgrade;
      if (!nameOk || charCard.chakra >= selectedCard.chakra) return false;

      if (!sameNameMatch && isFlexUpgrade) {
        const wouldConflict = myChars.some(other => {
          if (other.instanceId === c.instanceId || other.isHidden) return false;
          const oCard = other.topCard ?? other.card;
          if (!oCard) return false;
          return oCard.name_fr.toUpperCase() === selectedCard.name_fr.toUpperCase();
        });
        if (wouldConflict) return false;
      }
      return true;
    });
  }, [selectedCard, selectedMissionIndex, visibleState?.activeMissions, myPlayer]);

  const canReveal = isMyTurn && isActionPhase && hasTargetSelected && !hasPassed;
  
  let revealBaseCost = 0;
  const revealUpgradeTargets: { instanceId: string; name: string; cost: number; isSameName: boolean }[] = [];
  if (hasTargetSelected && visibleState.activeMissions) {
    for (let mi = 0; mi < visibleState.activeMissions.length; mi++) {
      const m = visibleState.activeMissions[mi];
      const myChars =
        myPlayer === 'player1' ? m.player1Characters : m.player2Characters;
      const target = myChars.find((c) => c.instanceId === selectedTargetId);
      if (target && target.isHidden && target.card) {
        const hiddenTopCard = target.topCard ?? target.card;
        revealBaseCost = calculateEffectiveCost(visibleState, myPlayer, hiddenTopCard, mi, true);
        
        for (const c of myChars) {
          if (c.instanceId === selectedTargetId || c.isHidden) continue;
          const cTop = c.topCard ?? c.card;
          if (!cTop) continue;
          if (hiddenTopCard.chakra <= cTop.chakra) continue;
          const isSameName = cTop.name_fr.toUpperCase() === hiddenTopCard.name_fr.toUpperCase();
          const isFlexible = checkFlexibleUpgrade(hiddenTopCard as any, cTop as any);
          if (isSameName || isFlexible) {
            
            if (isFlexible && !isSameName) {
              const wouldConflict = myChars.some(other => {
                if (other.instanceId === selectedTargetId || other.instanceId === c.instanceId || other.isHidden) return false;
                const oCard = other.topCard ?? other.card;
                if (!oCard) return false;
                return oCard.name_fr.toUpperCase() === hiddenTopCard.name_fr.toUpperCase();
              });
              if (wouldConflict) continue;
            }
            const rawRevUpgCost = Math.max(0, revealBaseCost - (cTop.chakra ?? 0));
            
            const upgradeCost = hasKurenai034CostReduction(visibleState, myPlayer, hiddenTopCard, mi)
              ? Math.max(1, rawRevUpgCost) : rawRevUpgCost;
            revealUpgradeTargets.push({
              instanceId: c.instanceId,
              name: getCardName(cTop, locale),
              cost: upgradeCost,
              isSameName,
            });
          }
        }
        break;
      }
    }
  }

  const hasSameNameRevealUpgrade = revealUpgradeTargets.some(t => t.isSameName);
  const canShowPlainReveal = !hasSameNameRevealUpgrade;
  const canAffordReveal = myState.chakra >= revealBaseCost;

  const handlePlayVisible = () => {
    if (!cardAndMissionReady || !canAffordCard || !isMyTurn || hasPassed || actionsBlocked) return;
    clearActionError();
    performAction({
      type: 'PLAY_CHARACTER',
      cardIndex: selectedCardIndex!,
      missionIndex: selectedMissionIndex!,
      hidden: false,
    });
    
    const error = useGameStore.getState().actionError;
    if (!error) clearSelection();
  };

  const handlePlayHidden = () => {
    if (!cardAndMissionReady || !canAffordHidden || !isMyTurn || hasPassed || actionsBlocked) return;
    clearActionError();
    performAction({
      type: 'PLAY_HIDDEN',
      cardIndex: selectedCardIndex!,
      missionIndex: selectedMissionIndex!,
    });
    const error = useGameStore.getState().actionError;
    if (!error) clearSelection();
  };

  const handleReveal = (upgradeTargetInstanceId?: string) => {
    if (!canReveal || !selectedTargetId || actionsBlocked) {
      console.warn('[ActionBar] handleReveal blocked:', { canReveal, canAffordReveal, selectedTargetId });
      return;
    }
    
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
        upgradeTargetInstanceId,
      });
    } else {
      console.warn('[ActionBar] handleReveal: character not found in any mission', { selectedTargetId });
    }
    clearSelection();
  };

  const handleUpgrade = (targetInstanceId: string) => {
    if (!cardAndMissionReady || !isMyTurn || hasPassed || selectedMissionIndex === null || actionsBlocked) return;
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
    if (!isMyTurn || !isActionPhase || hasPassed || actionsBlocked) return;
    
    if (myState.chakra >= 1 && !confirmingPass) {
      setConfirmingPass(true);
      return;
    }
    setConfirmingPass(false);
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

  if (!isActionPhase) {
    return (
      <>
        <div
          className="flex items-center justify-center gap-2 py-1.5 px-4"
          style={{
            backgroundColor: 'rgba(10, 10, 14, 0.9)',
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
      className="flex items-center justify-center gap-2 py-2 px-4"
      style={{
        backgroundColor: 'rgba(10, 10, 14, 0.9)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      
      {!isMyTurn && (
        <span style={{ fontSize: dims.isMobile ? '14px' : '12px', color: '#888888' }}>
          {t('game.opponentTurn')}
        </span>
      )}

      {isMyTurn && hasPassed && (
        <span style={{ fontSize: dims.isMobile ? '14px' : '12px', color: '#888888' }}>
          {t('game.processing')}
        </span>
      )}

      {isMyTurn && !hasPassed && (
        <>

          {actionError && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-medium px-2 py-0.5"
              style={{ fontSize: dims.isMobile ? '14px' : '12px', color: '#ff6b6b', backgroundColor: 'rgba(179, 62, 62, 0.15)' }}
            >
              {actionErrorKey && t.has(actionErrorKey)
                ? t(actionErrorKey, localizeMessageParams(actionErrorParams ?? {}, locale) ?? {})
                : actionError}
            </motion.span>
          )}

          {!actionError && !hasCardSelected && !hasTargetSelected && (
            <span style={{ fontSize: dims.isMobile ? '14px' : '12px', color: '#888888' }}>
              {t('game.selectTarget')}
            </span>
          )}

          {!actionError && hasCardSelected && !hasMissionSelected && (
            <span style={{ fontSize: dims.isMobile ? '14px' : '12px', color: '#888888' }}>
              {t('game.selectMission')}
            </span>
          )}

          {cardAndMissionReady && upgradeTargets.map((target) => {
            const charCard = target.topCard ?? target.card;
            const isHiddenTarget = target.isHidden;

            const rawUpgradeCost = isHiddenTarget
              ? effectiveCost
              : effectiveCost - (charCard?.chakra ?? 0);
            
            const upgradeCost = (!isHiddenTarget && selectedCard && visibleState && selectedMissionIndex !== null
              && hasKurenai034CostReduction(visibleState, myPlayer, selectedCard, selectedMissionIndex))
              ? Math.max(1, rawUpgradeCost) : rawUpgradeCost;
            const canAffordUpgrade = myState.chakra >= upgradeCost;
            const targetName = charCard ? getCardName(charCard, locale) : '';
            const upgradeLabel = isHiddenTarget
              ? `${t('game.reveal')} + ${t('game.actions.upgrade')} ${targetName} (${upgradeCost} ${t('game.chakra').toLowerCase()})`
              : `${t('game.actions.upgrade')} ${targetName} (${upgradeCost} ${t('game.chakra').toLowerCase()})`;
            return (
              <ActionButton
                key={target.instanceId}
                label={upgradeLabel}
                onClick={() => handleUpgrade(target.instanceId)}
                disabled={!canAffordUpgrade}
                variant="primary"
              />
            );
          })}

          {cardAndMissionReady && (
            <ActionButton
              label={`${t('game.play')} (${costLabel} ${t('game.chakra').toLowerCase()})`}
              onClick={handlePlayVisible}
              disabled={!canAffordCard}
              variant={upgradeTargets.length > 0 ? "secondary" : "primary"}
            />
          )}

          {cardAndMissionReady && (
            <ActionButton
              label={t('game.actions.playHiddenCharacter')}
              onClick={handlePlayHidden}
              disabled={!canAffordHidden}
              variant="secondary"
            />
          )}

          {canReveal && revealUpgradeTargets.map((opt) => {
            const canAfford = myState.chakra >= opt.cost;
            return (
              <ActionButton
                key={`reveal-upgrade-${opt.instanceId}`}
                label={`${t('game.reveal')} + ${t('game.actions.upgrade')} ${opt.name} (${opt.cost} ${t('game.chakra').toLowerCase()})`}
                onClick={() => handleReveal(opt.instanceId)}
                disabled={!canAfford}
                variant="primary"
              />
            );
          })}

          {canReveal && canShowPlainReveal && (
            <ActionButton
              label={`${t('game.reveal')} (${revealBaseCost} ${t('game.chakra').toLowerCase()})`}
              onClick={() => handleReveal()}
              disabled={!canAffordReveal}
              variant={revealUpgradeTargets.length > 0 ? "secondary" : "primary"}
            />
          )}

          {(hasCardSelected || hasTargetSelected || hasMissionSelected) && (
            <ActionButton
              label={t('common.cancel')}
              onClick={handleCancel}
              disabled={false}
              variant="danger"
            />
          )}

          {confirmingPass ? (
            <div className="flex items-center gap-1.5">
              <span className="whitespace-nowrap" style={{ fontSize: dims.isMobile ? '13px' : '10px', color: '#c4a35a' }}>
                {t('game.passConfirm', { chakra: myState.chakra })}
              </span>
              <ActionButton
                label={t('common.confirm')}
                onClick={handlePass}
                disabled={actionsBlocked}
                variant="primary"
              />
              <ActionButton
                label={t('common.cancel')}
                onClick={() => setConfirmingPass(false)}
                disabled={false}
                variant="muted"
              />
            </div>
          ) : (
            <ActionButton
              label={t('game.pass')}
              onClick={handlePass}
              disabled={actionsBlocked}
              variant="muted"
            />
          )}
        </>
      )}

      {isOnlineGame && (
        <ActionButton
          label={t('game.actions.abandon')}
          onClick={() => setShowAbandonConfirm(true)}
          disabled={false}
          variant="danger"
        />
      )}

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
  const dims = useGameScale();

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.03 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`font-medium cursor-pointer uppercase ${dims.isMobile ? 'px-4 py-2 text-[14px]' : dims.isCompact ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-1.5 text-xs'}`}
      style={{
        backgroundColor: disabled ? 'rgba(255, 255, 255, 0.02)' : styles.bg,
        border: 'none',
        color: disabled ? styles.textDisabled : styles.text,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.3)',
        transform: 'skewX(-3deg)',
        letterSpacing: '0.08em',
        fontWeight: 700,
      }}
    >
      <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
        {label}
      </span>
    </motion.button>
  );
}

function AbandonConfirmDialog({
  onConfirm,
  onCancel,
  t,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations>;
}) {

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(4, 4, 8, 0.92)', zIndex: 9999 }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col items-center gap-5 p-8 mx-4"
        style={{
          backgroundColor: 'rgba(8, 8, 14, 0.95)',
          boxShadow: '0 16px 64px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255,255,255,0.04)',
          maxWidth: 'min(400px, calc(100vw - 32px))',
        }}
      >
        
        <div style={{ position: 'absolute', top: -1, left: -1, width: 20, height: 20, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -1, right: -1, width: 20, height: 20, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -1, left: -1, width: 20, height: 20, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: 20, height: 20, pointerEvents: 'none' }} />

        <span className="text-lg font-bold text-center uppercase tracking-wider" style={{ color: '#b33e3e' }}>
          {t('game.actions.abandonConfirmTitle')}
        </span>
        <span className="font-body text-sm text-center" style={{ color: '#888888' }}>
          {t('game.actions.abandonConfirmMessage')}
        </span>
        <div className="flex gap-3 mt-2">
          <motion.button
            whileHover={{ scale: 1.03, backgroundColor: 'rgba(179, 62, 62, 0.8)', color: '#ffffff' }}
            whileTap={{ scale: 0.97 }}
            onClick={onConfirm}
            className="px-6 py-2 text-sm font-bold cursor-pointer uppercase"
            style={{
              backgroundColor: 'rgba(179, 62, 62, 0.18)',
              border: 'none',
              color: '#b33e3e',
              transform: 'skewX(-3deg)',
              letterSpacing: '0.1em',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
              {t('game.actions.abandonConfirm')}
            </span>
          </motion.button>
          <motion.button
            whileHover={{ opacity: 1, color: '#999999' }}
            whileTap={{ scale: 0.97 }}
            onClick={onCancel}
            className="uppercase no-select cursor-pointer"
            style={{
              background: 'none',
              border: 'none',
              color: '#555555',
              fontSize: '11px',
              letterSpacing: '0.14em',
              fontWeight: 600,
              padding: '8px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
            }}
          >
            {t('game.actions.abandonCancel')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
