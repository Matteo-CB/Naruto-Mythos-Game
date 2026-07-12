'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ChakraPoolProps {
  amount: number;
  label: string;
  isOpponent?: boolean;
}

export function ChakraPool({ amount, label, isOpponent = false }: ChakraPoolProps) {
  const [displayAmount, setDisplayAmount] = useState(amount);
  const [isIncreasing, setIsIncreasing] = useState(false);
  const [floatDelta, setFloatDelta] = useState<{ value: number; key: number } | null>(null);

  useEffect(() => {
    if (amount !== displayAmount) {
      setIsIncreasing(amount > displayAmount);
      setFloatDelta({ value: amount - displayAmount, key: Date.now() });
      setDisplayAmount(amount);
    }
  }, [amount, displayAmount]);

  useEffect(() => {
    if (!floatDelta) return;
    const timer = setTimeout(() => setFloatDelta(null), 700);
    return () => clearTimeout(timer);
  }, [floatDelta]);

  return (
    <div data-anchor={isOpponent ? 'chakra:opp' : 'chakra:me'} className="relative flex flex-col items-center gap-1">
      <AnimatePresence>
        {floatDelta && (
          <motion.span
            key={floatDelta.key}
            initial={{ opacity: 0, y: 4, scale: 0.85 }}
            animate={{ opacity: 1, y: -14, scale: 1.05 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="absolute -top-3 text-sm font-bold tabular-nums pointer-events-none"
            style={{
              color: floatDelta.value > 0 ? '#e6c36a' : '#d97676',
              textShadow: '0 2px 8px rgba(0,0,0,0.9)',
              zIndex: 5,
            }}
          >
            {floatDelta.value > 0 ? `+${floatDelta.value}` : floatDelta.value}
          </motion.span>
        )}
      </AnimatePresence>
      <span className="flex items-center gap-1 text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
        <img src="/images/icons/chakra-swirl.svg" alt="" draggable={false} style={{ width: 12, height: 12, opacity: 0.55 }} />
        {label}
      </span>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={amount}
          initial={{ scale: 1.3, opacity: 0, y: isIncreasing ? 8 : -8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex items-center justify-center px-3 py-1.5"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.08)',
            minWidth: '52px',
          }}
        >
          <motion.span
            className="text-xl font-bold tabular-nums"
            style={{ color: isOpponent ? '#b33e3e' : '#c4a35a' }}
            animate={
              amount !== displayAmount
                ? { scale: [1, 1.2, 1] }
                : {}
            }
          >
            {amount}
          </motion.span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
