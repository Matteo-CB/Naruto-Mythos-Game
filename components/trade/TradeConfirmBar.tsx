'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface TradeConfirmBarProps {
  myReady: boolean;
  partnerReady: boolean;
  partnerName: string;
  busy: boolean;
  onToggleReady: () => void;
  onCancel: () => void;
}

const ACCENT = '#c4a35a';

export function TradeConfirmBar({ myReady, partnerReady, partnerName, busy, onToggleReady, onCancel }: TradeConfirmBarProps) {
  const t = useTranslations('trade');

  return (
    <div className="flex items-center justify-center gap-4 flex-wrap">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="font-display px-5 py-2.5 text-[11px] uppercase tracking-widest"
        style={{ color: '#888', backgroundColor: '#141414', cursor: busy ? 'wait' : 'pointer' }}
      >
        {t('cancel')}
      </button>

      <div className="flex items-center gap-2">
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: partnerReady ? '#5fb05f' : '#555' }}
        >
          {partnerReady ? t('confirmed') : t('waitingFor', { name: partnerName })}
        </span>
      </div>

      <motion.button
        type="button"
        onClick={onToggleReady}
        disabled={busy}
        className="font-display px-6 py-2.5 text-[12px] uppercase tracking-widest"
        style={{
          backgroundColor: myReady ? '#1a1a1a' : ACCENT,
          color: myReady ? ACCENT : '#0a0a0a',
          cursor: busy ? 'wait' : 'pointer',
        }}
        animate={!myReady && !busy ? { boxShadow: [`0 0 6px ${ACCENT}55`, `0 0 14px ${ACCENT}aa`, `0 0 6px ${ACCENT}55`] } : undefined}
        transition={{ duration: 1.6, repeat: Infinity }}
      >
        {myReady ? t('confirmed') : t('confirm')}
      </motion.button>
    </div>
  );
}
