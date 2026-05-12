'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualCardGridProps<T> {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T) => ReactNode;
  minColWidth?: number;
  fixedColumns?: number;
  cellAspectRatio?: number;
  gap?: number;
  overscanRows?: number;
  paddingX?: number;
  paddingBottom?: number;
  className?: string;
  style?: CSSProperties;
  scrollElementRef?: RefObject<HTMLElement | null>;
}

export function VirtualCardGrid<T>({
  items,
  getItemKey,
  renderItem,
  minColWidth = 72,
  fixedColumns,
  cellAspectRatio = 7 / 5,
  gap = 6,
  overscanRows = 4,
  paddingX = 0,
  paddingBottom = 0,
  className,
  style,
  scrollElementRef,
}: VirtualCardGridProps<T>) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const sizingRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const usingExternalScroll = !!scrollElementRef;

  useLayoutEffect(() => {
    const el = sizingRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - paddingX * 2;
      if (w > 0) setContainerWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [paddingX]);

  const { columnCount, cellWidth, cellHeight, rowHeight } = useMemo(() => {
    if (containerWidth <= 0) {
      return { columnCount: 0, cellWidth: 0, cellHeight: 0, rowHeight: 0 };
    }
    let cols: number;
    if (fixedColumns && fixedColumns > 0) {
      cols = fixedColumns;
    } else {
      const available = containerWidth + gap;
      cols = Math.max(1, Math.floor(available / (minColWidth + gap)));
    }
    const totalGap = gap * (cols - 1);
    const w = Math.floor((containerWidth - totalGap) / cols);
    const h = Math.floor(w * cellAspectRatio);
    return { columnCount: cols, cellWidth: w, cellHeight: h, rowHeight: h + gap };
  }, [containerWidth, minColWidth, fixedColumns, cellAspectRatio, gap]);

  const rowCount = columnCount > 0 ? Math.ceil(items.length / columnCount) : 0;

  const getScrollElement = useMemo(() => {
    if (usingExternalScroll) return () => scrollElementRef!.current as HTMLElement | null;
    return () => ownRef.current;
  }, [usingExternalScroll, scrollElementRef]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement,
    estimateSize: () => rowHeight || 1,
    overscan: overscanRows,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowCount, rowVirtualizer]);

  const totalHeight = rowCount * rowHeight - (rowCount > 0 ? gap : 0) + paddingBottom;

  const trackChildren = (
    <div style={{ height: Math.max(0, totalHeight), position: 'relative', width: '100%' }}>
      {columnCount > 0 && rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const startIdx = virtualRow.index * columnCount;
        const endIdx = Math.min(startIdx + columnCount, items.length);
        const rowItems: ReactNode[] = [];
        for (let i = startIdx; i < endIdx; i++) {
          const col = i - startIdx;
          const left = paddingX + col * (cellWidth + gap);
          const item = items[i];
          rowItems.push(
            <div
              key={getItemKey(item, i)}
              style={{
                position: 'absolute',
                top: 0,
                left,
                width: cellWidth,
                height: cellHeight,
                contain: 'layout style paint',
              }}
            >
              {renderItem(item)}
            </div>,
          );
        }
        return (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              left: 0,
              right: 0,
              height: cellHeight,
            }}
          >
            {rowItems}
          </div>
        );
      })}
    </div>
  );

  if (usingExternalScroll) {
    return (
      <div ref={sizingRef} className={className} style={{ position: 'relative', width: '100%', ...style }}>
        {trackChildren}
      </div>
    );
  }

  return (
    <div
      ref={(node) => { ownRef.current = node; sizingRef.current = node; }}
      className={className}
      style={{
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
        ...style,
      }}
    >
      {trackChildren}
    </div>
  );
}
