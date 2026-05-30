'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { useToastStore, type ToastItem, type ToastType } from '@/stores/toastStore';

const TOAST_CLIP = 'polygon(11px 0, calc(100% - 11px) 0, 100% 11px, 100% calc(100% - 11px), calc(100% - 11px) 100%, 11px 100%, 0 calc(100% - 11px), 0 11px)';

const TYPE_ACCENT: Record<ToastType, string> = {
  error: '#d97676',
  info: '#c4a35a',
  success: '#5fb05f',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      className="fixed inset-x-3 sm:inset-x-auto sm:right-5 sm:left-auto bottom-4 sm:bottom-5 z-50 flex flex-col items-stretch sm:items-end gap-2.5 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toast({ toast }: { toast: ToastItem }) {
  const t = useTranslations();
  const dismiss = useToastStore((s) => s.dismissToast);
  const accent = TYPE_ACCENT[toast.type];

  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismiss]);

  const title = toast.titleKey ? t(toast.titleKey) : toast.title;
  const message = toast.messageKey ? t(toast.messageKey) : toast.message;
  const actionLabel = toast.action?.labelKey
    ? t(toast.action.labelKey)
    : toast.action?.label;

  const onActionClick = () => {
    if (toast.action?.onClick) toast.action.onClick();
    dismiss(toast.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 56, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 56, scale: 0.94 }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full sm:w-[340px] pointer-events-auto no-select overflow-hidden"
      style={{
        backgroundColor: '#0d0c10',
        clipPath: TOAST_CLIP,
        boxShadow: `0 18px 44px rgba(0,0,0,0.6), 0 0 18px ${accent}22`,
      }}
    >
      <div className="flex flex-col gap-1.5 px-4 py-3" style={{ backgroundColor: `${accent}12` }}>
        {title && (
          <div className="flex items-center gap-2.5">
            <span
              className="font-display text-[10px] uppercase leading-none whitespace-nowrap"
              style={{ color: accent, letterSpacing: '0.26em' }}
            >
              {title}
            </span>
            <motion.span
              className="flex-1 h-px origin-left"
              style={{ backgroundColor: `${accent}55` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.06 }}
            />
          </div>
        )}
        {message && (
          <span className="text-[12.5px] leading-snug" style={{ color: '#e8e6df' }}>
            {message}
          </span>
        )}
        <div className="flex items-center justify-between gap-3 mt-0.5">
          {toast.action && actionLabel ? (
            toast.action.href ? (
              <Link
                href={toast.action.href as '/'}
                onClick={() => dismiss(toast.id)}
                className="font-display text-[10px] uppercase cursor-pointer transition-opacity hover:opacity-80"
                style={{ color: accent, letterSpacing: '0.16em' }}
              >
                {actionLabel}
              </Link>
            ) : (
              <button
                type="button"
                onClick={onActionClick}
                className="font-display text-[10px] uppercase cursor-pointer transition-opacity hover:opacity-80"
                style={{ color: accent, letterSpacing: '0.16em', background: 'none', border: 'none', padding: 0 }}
              >
                {actionLabel}
              </button>
            )
          ) : <span />}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="font-display text-[9px] uppercase cursor-pointer transition-colors hover:text-[#999]"
            style={{ color: '#555', letterSpacing: '0.16em', background: 'none', border: 'none', padding: 0 }}
          >
            {t('common.dismiss')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
