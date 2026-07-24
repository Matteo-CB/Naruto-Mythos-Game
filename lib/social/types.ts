export interface DeckSnapshot {
  deckId?: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
}

export interface ReplaySnapshot {
  gameId: string;
  actionIndex?: number;
  player1Name: string;
  player2Name: string;
  winnerName?: string | null;
  player1Score?: number;
  player2Score?: number;
  isAiGame?: boolean;
  available?: boolean;
}

export interface PostView {
  id: string;
  author: { id: string; username: string } | null;
  body: string;
  deck: DeckSnapshot | null;
  replay: ReplaySnapshot | null;
  gifUrl: string | null;
  createdAt: string;
  parentId: string | null;
  pinned: boolean;
  replyCount: number;
  likeCount: number;
  repostCount: number;
  viewerLiked: boolean;
  repostOf: PostView | null;
}

export type FeedFilter = 'all' | 'following' | 'friends';
