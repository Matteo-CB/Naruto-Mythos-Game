interface CountryFlagProps {
  code: string | null | undefined;
  size?: number;
  title?: string;
}

export function CountryFlag({ code, size = 18, title }: CountryFlagProps) {
  if (!code || !/^[a-z]{2}$/.test(code)) return null;
  return (
    <img
      src={`/images/flags/${code}.svg`}
      alt=""
      title={title}
      draggable={false}
      width={size}
      height={Math.round((size * 3) / 4)}
      loading="lazy"
      decoding="async"
      style={{
        display: 'inline-block',
        width: size,
        height: Math.round((size * 3) / 4),
        borderRadius: 2,
        objectFit: 'cover',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.14)',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  );
}
