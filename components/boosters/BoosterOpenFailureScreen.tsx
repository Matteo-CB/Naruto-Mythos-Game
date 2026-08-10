'use client';

import { motion } from 'framer-motion';

interface BoosterOpenFailureScreenProps {
  title: string;
  body: string;
  backLabel: string;
  onClose: () => void;
}

export function BoosterOpenFailureScreen({ title, body, backLabel, onClose }: BoosterOpenFailureScreenProps) {
  return (
    <motion.div
      className="fixed inset-0 z-55 flex flex-col items-center justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{ backgroundColor: 'var(--t-overlay)' }}
    >
      <div className="max-w-md text-center px-6">
        <div
          className="font-display uppercase tracking-wider mb-3"
          style={{ color: 'var(--t-accent)', fontSize: 14, letterSpacing: '0.22em' }}
        >
          {title}
        </div>
        <div className="font-body text-sm mb-6" style={{ color: 'var(--t-text)' }}>
          {body}
        </div>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="px-6 py-2 font-display uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--t-accent-tint)',
            color: 'var(--t-accent)',
            fontSize: 13,
            letterSpacing: '0.18em',
            boxShadow: '0 0 12px var(--t-accent-glow)',
          }}
        >
          {backLabel}
        </button>
      </div>
    </motion.div>
  );
}
