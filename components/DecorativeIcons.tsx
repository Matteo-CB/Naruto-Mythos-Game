'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const DECORATIVE_PLACEMENTS = [
  { src: '/images/icons/shuriken.webp', x: '93%', y: '8%',  size: 40, rotation: 0,   opacity: 0.05, floatDelay: 1 },
  { src: '/images/icons/shuriken.webp', x: '5%',  y: '75%', size: 35, rotation: 22,  opacity: 0.04, floatDelay: 3 },
  { src: '/images/icons/shuriken.webp', x: '48%', y: '93%', size: 30, rotation: 45,  opacity: 0.03, floatDelay: 5 },
  { src: '/images/icons/akatsuki-cloud.webp', x: '85%', y: '45%', size: 50, rotation: 5,  opacity: 0.04, floatDelay: 2.5 },
  { src: '/images/icons/akatsuki-cloud.webp', x: '8%',  y: '90%', size: 40, rotation: -5, opacity: 0.03, floatDelay: 4.5 },
];

interface DecorativeIconsProps {
  className?: string;
  animated?: boolean;
}

export const DecorativeIcons = memo(function DecorativeIcons(_props: DecorativeIconsProps) {
  
  return null;
  
});
