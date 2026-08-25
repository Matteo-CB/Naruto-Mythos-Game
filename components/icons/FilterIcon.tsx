interface FilterIconProps {
  size?: number;
  className?: string;
}

export function FilterIcon({ size = 14, className }: FilterIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </svg>
  );
}
