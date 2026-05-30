'use client';

import type { ImgHTMLAttributes } from 'react';
import { BOOSTER_FALLBACK_IMAGE } from '@/lib/data/sets/registry';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src?: string | null;
};

export function BoosterImg({ src, alt = '', ...rest }: Props) {
  return (
    <img
      {...rest}
      alt={alt}
      src={src && src.trim() ? src : BOOSTER_FALLBACK_IMAGE}
      onError={(e) => {
        const t = e.currentTarget;
        if (!t.src.endsWith(BOOSTER_FALLBACK_IMAGE)) t.src = BOOSTER_FALLBACK_IMAGE;
      }}
    />
  );
}
