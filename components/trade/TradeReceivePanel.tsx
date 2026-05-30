'use client';

import { TradeOfferPanel } from './TradeOfferPanel';

interface TradeReceivePanelProps {
  title: string;
  cardIds: string[];
}

export function TradeReceivePanel({ title, cardIds }: TradeReceivePanelProps) {
  return <TradeOfferPanel title={title} cardIds={cardIds} editable={false} />;
}
