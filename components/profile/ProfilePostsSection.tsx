'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { PostCard } from '@/components/social/PostCard';
import { useViewerPrivilege } from '@/lib/hooks/useViewerPrivilege';
import type { PostView } from '@/lib/social/types';

export function ProfilePostsSection({ userId }: { userId: string }) {
  const t = useTranslations('feed');
  const { status } = useSession();
  const privilege = useViewerPrivilege();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    fetch(`/api/posts/user/${userId}`)
      .then((r) => r.json())
      .then((d) => setPosts(Array.isArray(d.posts) ? d.posts : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [userId, status]);

  if (!loaded || posts.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-display text-xs uppercase tracking-[0.28em]" style={{ color: 'var(--t-accent)' }}>{t('posts')}</span>
        <span className="font-inter-force text-[10px]" style={{ color: 'var(--t-dim)' }}>{posts.length}</span>
      </div>
      <div style={{ backgroundColor: 'var(--t-panel)', boxShadow: '0 12px 32px var(--t-shadow)' }}>
        {posts.map((p) => (
          <PostCard key={p.id} post={p} isAdmin={privilege.isAdmin} onDelete={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
        ))}
      </div>
    </section>
  );
}
