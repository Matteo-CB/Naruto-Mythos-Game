'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';

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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex flex-col items-center gap-6 p-8"
        >
          <h2
            className="text-2xl font-bold uppercase tracking-wider"
            style={{ color: '#c4a35a' }}
          >
            {t('switchTitle')}
          </h2>

          <p className="text-lg text-[#ccc] text-center">
            {t('switchMessage', { player: nextPlayerName })}
          </p>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={confirmHotseatSwitch}
            className="mt-4 px-10 py-3 text-base font-bold uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: '#1a1a1a',
              border: '2px solid #c4a35a',
              color: '#e0e0e0',
            }}
          >
            {t('switchConfirm')}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
