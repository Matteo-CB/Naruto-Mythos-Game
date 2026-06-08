'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

interface Props {
  open: boolean;
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function ConfirmDeleteModal({ open, title, body, cancelLabel, confirmLabel, onCancel, onConfirm, loading = false }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!loading) onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-delete"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: Z_APP_MODAL + 2 }}
          onClick={() => !loading && onCancel()}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="max-w-sm w-full rounded-lg p-5 flex flex-col gap-4"
            style={{ backgroundColor: '#141414' }}
          >
            <h3 className="font-display text-base tracking-wider uppercase" style={{ color: '#c4a35a' }}>
              {title}
            </h3>
            <p className="font-body text-sm leading-relaxed" style={{ color: '#bbbbbb' }}>
              {body}
            </p>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="font-display uppercase text-xs tracking-widest px-3 py-2 rounded-md transition-opacity"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#e8e8e8', opacity: loading ? 0.5 : 1 }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className="font-display uppercase text-xs tracking-widest px-3 py-2 rounded-md transition-opacity"
                style={{
                  backgroundColor: 'rgba(212,127,127,0.18)',
                  color: '#d47f7f',
                  opacity: loading ? 0.5 : 1,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
