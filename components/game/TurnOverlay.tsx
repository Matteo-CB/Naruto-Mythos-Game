'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';

export function TurnOverlay() {
  const showTurnOverlay = useUIStore((s) => s.showTurnOverlay);
  const turnOverlayText = useUIStore((s) => s.turnOverlayText);
  const hideTurnOverlay = useUIStore((s) => s.hideTurnOverlay);
  const [phase, setPhase] = useState<'in' | 'out' | 'hidden'>('hidden');

  useEffect(() => {
    if (showTurnOverlay) {
      setPhase('in');
      const holdTimer = setTimeout(() => setPhase('out'), 2000);
      const hideTimer = setTimeout(() => {
        setPhase('hidden');
        hideTurnOverlay();
      }, 2800);
      return () => { clearTimeout(holdTimer); clearTimeout(hideTimer); };
    } else {
      setPhase('hidden');
    }
  }, [showTurnOverlay, hideTurnOverlay]);

  const visible = phase === 'in' || phase === 'out';
  const exiting = phase === 'out';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: exiting ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: exiting ? 0.8 : 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(4, 4, 8, 0.8)' }}
        >
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={exiting
              ? { scale: 0.3, opacity: 0 }
              : { scale: 1, opacity: 1 }
            }
            transition={exiting
              ? { duration: 0.7, ease: [0.4, 0, 1, 1] }
              : { type: 'spring', stiffness: 200, damping: 15 }
            }
            className="relative flex flex-col items-center gap-3"
            style={{ padding: '24px 48px' }}
          >
            {/* Corner brackets */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: 28, height: 28, borderTop: '2px solid rgba(196, 163, 90, 0.4)', borderLeft: '2px solid rgba(196, 163, 90, 0.4)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: 28, height: 28, borderTop: '2px solid rgba(196, 163, 90, 0.4)', borderRight: '2px solid rgba(196, 163, 90, 0.4)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 28, height: 28, borderBottom: '2px solid rgba(196, 163, 90, 0.4)', borderLeft: '2px solid rgba(196, 163, 90, 0.4)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderBottom: '2px solid rgba(196, 163, 90, 0.4)', borderRight: '2px solid rgba(196, 163, 90, 0.4)', pointerEvents: 'none' }} />

            <motion.span
              className="font-display text-5xl font-bold tracking-widest uppercase"
              style={{ color: '#c4a35a' }}
              initial={{ letterSpacing: '0.5em', opacity: 0 }}
              animate={exiting
                ? { letterSpacing: '0.5em', opacity: 0 }
                : { letterSpacing: '0.2em', opacity: 1 }
              }
              transition={exiting
                ? { duration: 0.6, ease: 'easeIn' }
                : { delay: 0.1, duration: 0.4 }
              }
            >
              {turnOverlayText}
            </motion.span>

            {/* Animated chakra line */}
            <svg
              width={200}
              height="3"
              viewBox="0 0 200 3"
              style={{ overflow: 'visible' }}
            >
              <motion.line
                x1={100}
                y1="1.5"
                x2={200}
                y2="1.5"
                stroke="#c4a35a"
                strokeWidth="1"
                strokeOpacity="0.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: exiting ? 0 : 1 }}
                transition={exiting
                  ? { duration: 0.5, ease: 'easeIn' }
                  : { duration: 0.6, delay: 0.2, ease: 'easeOut' }
                }
              />
              <motion.line
                x1={100}
                y1="1.5"
                x2={0}
                y2="1.5"
                stroke="#c4a35a"
                strokeWidth="1"
                strokeOpacity="0.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: exiting ? 0 : 1 }}
                transition={exiting
                  ? { duration: 0.5, ease: 'easeIn' }
                  : { duration: 0.6, delay: 0.2, ease: 'easeOut' }
                }
              />
              <motion.rect
                x={98}
                y="-0.5"
                width="4"
                height="4"
                fill="#c4a35a"
                style={{ transformOrigin: 'center', transform: 'rotate(45deg)' }}
                initial={{ scale: 0 }}
                animate={{ scale: exiting ? 0 : 1 }}
                transition={exiting
                  ? { duration: 0.3, ease: 'easeIn' }
                  : { delay: 0.15, type: 'spring', stiffness: 400 }
                }
              />
            </svg>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
