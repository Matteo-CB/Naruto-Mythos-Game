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

  useEffect(() => {
    if (amount !== displayAmount) {
      setIsIncreasing(amount > displayAmount);
      setDisplayAmount(amount);
    }
  }, [amount, displayAmount]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-xs uppercase tracking-wider"
        style={{ color: '#888888' }}
      >
        {label}
      </span>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={amount}
          initial={{ scale: 1.3, opacity: 0, y: isIncreasing ? 8 : -8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex items-center justify-center rounded-lg px-3 py-1.5"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
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
