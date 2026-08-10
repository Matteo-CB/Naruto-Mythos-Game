'use client';

import type { CSSProperties } from 'react';

export const CHAKRA_COLOR = '#4a9eff';
export const CHAKRA_COLOR_SOFT = '#8fc6ff';
export const POWER_COLOR = '#c4a35a';
export const POWER_COLOR_BRIGHT = '#e8c477';

export const CHAKRA_ICON_SRC = '/images/icons/chakra.svg';
export const POWER_ICON_SRC = '/images/icons/power.svg';

export function gameIconMaskCss(src: string, sizePx: number, color: string): string {
  return [
    'display:inline-block',
    `width:${sizePx}px`,
    `height:${sizePx}px`,
    'flex-shrink:0',
    `background-color:${color}`,
    `mask-image:url(${src})`,
    `-webkit-mask-image:url(${src})`,
    'mask-repeat:no-repeat',
    '-webkit-mask-repeat:no-repeat',
    'mask-position:center',
    '-webkit-mask-position:center',
    'mask-size:contain',
    '-webkit-mask-size:contain',
  ].join(';');
}

export interface GameIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  style?: CSSProperties;
  opacity?: number;
}

function MaskIcon({
  src,
  size = 16,
  color = 'currentColor',
  className = '',
  style,
  opacity,
}: GameIconProps & { src: string }) {
  const dimension = typeof size === 'number' ? `${size}px` : size;
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        width: dimension,
        height: dimension,
        flexShrink: 0,
        backgroundColor: color,
        opacity,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        ...style,
      }}
    />
  );
}

export function ChakraIcon({ color = CHAKRA_COLOR, ...props }: GameIconProps) {
  return <MaskIcon src={CHAKRA_ICON_SRC} color={color} {...props} />;
}

export function PowerIcon({ color = POWER_COLOR, ...props }: GameIconProps) {
  return <MaskIcon src={POWER_ICON_SRC} color={color} {...props} />;
}
