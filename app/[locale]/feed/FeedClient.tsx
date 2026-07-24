'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Composer } from '@/components/social/Composer';
import { PostCard } from '@/components/social/PostCard';
import { CloudBackground } from '@/components/CloudBackground';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Link } from '@/lib/i18n/navigation';
import { useDmStore } from '@/stores/dmStore';
import { useViewerPrivilege } from '@/lib/hooks/useViewerPrivilege';
import type { PostView, FeedFilter } from '@/lib/social/types';

const TABS: FeedFilter[] = ['all', 'following', 'friends'];

export function FeedClient() {
  const t = useTranslations('feed');
  const { data: session } = useSession();
  const privilege = useViewerPrivilege();
  const params = useSearchParams();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const prefillReplay = params.get('replay')
    ? { gameId: params.get('replay')!, actionIndex: params.get('action') ? Number(params.get('action')) : undefined }
    : null;
  const prefillDeck = params.get('deck') ? { deckId: params.get('deck')! } : null;

  const load = useCallback((f: FeedFilter) => {
    setLoading(true);
    fetch(`/api/posts?filter=${f}`)
      .then((r) => r.json())
      .then((d) => { setPosts(d.posts ?? []); setCursor(d.nextCursor ?? null); })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    fetch(`/api/posts?filter=${filter}&cursor=${encodeURIComponent(cursor)}`)
      .then((r) => r.json())
      .then((d) => { setPosts((p) => [...p, ...(d.posts ?? [])]); setCursor(d.nextCursor ?? null); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const onPosted = (post: PostView) => setPosts((p) => [post, ...p]);
  const onDelete = (id: string) => setPosts((p) => p.filter((x) => x.id !== id && x.repostOf?.id !== id));

  return (
    <main className="min-h-screen relative" style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8' }}>
      <CloudBackground />
      <div className="relative z-10 mx-auto" style={{ maxWidth: 620 }}>
        <header className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'rgba(10,10,10,0.86)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #17171a' }}>
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-[11px] uppercase tracking-widest" style={{ color: '#c4a35a' }}>‹ {t('home')}</Link>
            <h1 className="font-display text-lg uppercase tracking-[0.14em]" style={{ color: '#e8e6df' }}>{t('title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {session?.user?.id && (
              <button type="button" onClick={() => useDmStore.getState().openList(session.user!.id)}
                className="font-display text-[10px] uppercase tracking-widest px-3 py-1.5" style={{ backgroundColor: 'rgba(196,163,90,0.1)', color: '#c4a35a' }}>
                {t('messages')}
              </button>
            )}
            <LanguageSwitcher />
          </div>
        </header>

        <nav className="flex items-stretch" style={{ borderBottom: '1px solid #17171a', backgroundColor: 'rgba(10,10,10,0.6)' }}>
          {TABS.map((tab) => {
            const disabled = (tab === 'following' || tab === 'friends') && !session?.user?.id;
            const active = filter === tab;
            return (
              <button key={tab} type="button" disabled={disabled} onClick={() => setFilter(tab)}
                className="flex-1 py-3 font-display text-[11px] uppercase tracking-widest relative"
                style={{ color: active ? '#c4a35a' : disabled ? '#3a3a3e' : '#888', cursor: disabled ? 'default' : 'pointer' }}>
                {t(tab === 'all' ? 'tabAll' : tab === 'following' ? 'tabFollowing' : 'tabFriends')}
                {active && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-0.5" style={{ width: 34, backgroundColor: '#c4a35a' }} />}
              </button>
            );
          })}
        </nav>

        <Composer onPosted={onPosted} prefillReplay={prefillReplay} prefillDeck={prefillDeck} />

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: '#666' }}>{t('loading')}</div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: '#666' }}>{filter === 'all' ? t('empty') : t('emptyFollowing')}</div>
        ) : (
          <>
            {posts.map((p) => <PostCard key={p.id} post={p} onDelete={onDelete} isAdmin={privilege.isAdmin} />)}
            {cursor && (
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="w-full py-4 font-display text-[11px] uppercase tracking-widest" style={{ color: '#888' }}>
                {loadingMore ? t('loading') : t('loadMore')}
              </button>
            )}
          </>
        )}
        <div style={{ height: 80 }} />
      </div>
    </main>
  );
}
