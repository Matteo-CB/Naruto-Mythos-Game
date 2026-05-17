'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { useToastStore, type ToastItem, type ToastType } from '@/stores/toastStore';

const TYPE_COLOR: Record<ToastType, { accent: string; bg: string }> = {
  error: { accent: '#b33e3e', bg: 'rgba(20, 8, 8, 0.94)' },
  info: { accent: '#c4a35a', bg: 'rgba(15, 14, 10, 0.94)' },
  success: { accent: '#5fb05f', bg: 'rgba(10, 18, 12, 0.94)' },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      className="fixed inset-x-3 sm:inset-x-auto sm:right-4 sm:left-auto bottom-3 sm:bottom-4 z-50 flex flex-col gap-2 sm:max-w-sm pointer-events-none"
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
  const colors = TYPE_COLOR[toast.type];

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
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col gap-1.5 px-4 py-3 pointer-events-auto no-select"
      style={{
        backgroundColor: colors.bg,
        boxShadow: `0 16px 40px rgba(0,0,0,0.55), inset 1px 0 0 ${colors.accent}, inset 0 -1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {title && (
        <span
          className="text-[10px] font-bold uppercase"
          style={{ color: colors.accent, letterSpacing: '0.22em' }}
        >
          {title}
        </span>
      )}
      {message && (
        <span className="text-[12px]" style={{ color: '#e8e8e8' }}>
          {message}
        </span>
      )}
      <div className="flex items-center justify-between gap-3 mt-1">
        {toast.action && actionLabel ? (
          toast.action.href ? (
            <Link
              href={toast.action.href as '/'}
              onClick={() => dismiss(toast.id)}
              className="text-[11px] uppercase font-bold cursor-pointer"
              style={{ color: '#c4a35a', letterSpacing: '0.14em', textDecoration: 'underline' }}
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onActionClick}
              className="text-[11px] uppercase font-bold cursor-pointer"
              style={{ color: '#c4a35a', letterSpacing: '0.14em', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}
            >
              {actionLabel}
            </button>
          )
        ) : <span />}
        <button
          type="button"
          onClick={() => dismiss(toast.id)}
          className="text-[10px] uppercase cursor-pointer"
          style={{ color: '#555', letterSpacing: '0.14em', background: 'none', border: 'none', padding: 0 }}
        >
          {t('common.dismiss')}
        </button>
      </div>
    </motion.div>
  );
}
