'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';

export function TurnOverlay() {
  const showTurnOverlay = useUIStore((s) => s.showTurnOverlay);
  const turnOverlayText = useUIStore((s) => s.turnOverlayText);
  const hideTurnOverlay = useUIStore((s) => s.hideTurnOverlay);

  useEffect(() => {
    if (showTurnOverlay) {
      const timer = setTimeout(() => {
        hideTurnOverlay();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [showTurnOverlay, hideTurnOverlay]);

  return (
    <AnimatePresence>
      {showTurnOverlay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
            }}
            className="flex flex-col items-center gap-2"
          >
            <motion.span
              className="text-5xl font-bold tracking-widest uppercase"
              style={{ color: '#c4a35a' }}
              initial={{ letterSpacing: '0.5em', opacity: 0 }}
              animate={{ letterSpacing: '0.2em', opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              {turnOverlayText}
            </motion.span>
            <motion.div
              className="h-px w-48"
              style={{ backgroundColor: '#c4a35a' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
