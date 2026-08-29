'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

interface BadgeTooltipProps {
  titre: string;
  texte: string;
  children: ReactNode;
  onClick?: () => void;
}

export function BadgeTooltip({ titre, texte, children, onClick }: BadgeTooltipProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const ancre = useRef<HTMLSpanElement>(null);

  const montrer = useCallback(() => {
    const boite = ancre.current?.getBoundingClientRect();
    if (!boite) return;
    setPosition({ x: boite.left + boite.width / 2, y: boite.top });
  }, []);

  const cacher = useCallback(() => setPosition(null), []);

  return (
    <>
      <span
        ref={ancre}
        onMouseEnter={montrer}
        onMouseLeave={cacher}
        onFocus={montrer}
        onBlur={cacher}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        className="inline-flex items-center"
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        {children}
      </span>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {position && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              className="fixed flex flex-col gap-1 px-3 py-2"
              style={{
                left: position.x,
                top: position.y - 10,
                transform: 'translate(-50%, -100%)',
                maxWidth: 240,
                backgroundColor: 'var(--t-panel)',
                boxShadow: '0 10px 30px var(--t-shadow)',
                borderRadius: 4,
                pointerEvents: 'none',
                zIndex: Z_APP_MODAL,
              }}
            >
              <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
                {titre}
              </span>
              <span className="text-[11px] leading-snug" style={{ color: 'var(--t-muted)' }}>
                {texte}
              </span>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
