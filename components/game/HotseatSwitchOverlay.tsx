'use client';

import { AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupActionButton,
} from './PopupPrimitives';

export function HotseatSwitchOverlay() {
  const t = useTranslations('hotseat');
  const hotseatSwitchPending = useGameStore((s) => s.hotseatSwitchPending);
  const isHotseatGame = useGameStore((s) => s.isHotseatGame);
  const hotseatNextPlayer = useGameStore((s) => s.hotseatNextPlayer);
  const confirmHotseatSwitch = useGameStore((s) => s.confirmHotseatSwitch);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);

  if (!isHotseatGame || !hotseatSwitchPending || !hotseatNextPlayer) return null;

  const nextPlayerName = playerDisplayNames[hotseatNextPlayer];

  return (
    <AnimatePresence>
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.35)" maxWidth="460px" padding="32px 28px">
          <div className="flex flex-col items-center gap-6">
            <PopupTitle accentColor="#c4a35a" size="lg">
              {t('switchTitle')}
            </PopupTitle>

            <p className="font-body text-lg text-center" style={{ color: '#ccc' }}>
              {t('switchMessage', { player: nextPlayerName })}
            </p>

            <PopupActionButton onClick={confirmHotseatSwitch} accentColor="#c4a35a">
              {t('switchConfirm')}
            </PopupActionButton>
          </div>
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
