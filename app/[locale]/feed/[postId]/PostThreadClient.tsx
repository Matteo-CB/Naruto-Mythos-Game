'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Composer } from '@/components/social/Composer';
import { PostCard } from '@/components/social/PostCard';
import { CloudBackground } from '@/components/CloudBackground';
import { Link } from '@/lib/i18n/navigation';
import { useViewerPrivilege } from '@/lib/hooks/useViewerPrivilege';
import type { PostView } from '@/lib/social/types';

export function PostThreadClient({ initialPost, initialReplies }: { initialPost: PostView; initialReplies: PostView[] }) {
  const t = useTranslations('feed');
  const privilege = useViewerPrivilege();
  const [replies, setReplies] = useState<PostView[]>(initialReplies);

  return (
    <main className="min-h-screen relative" style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8' }}>
      <CloudBackground />
      <div className="relative z-10 mx-auto" style={{ maxWidth: 620 }}>
        <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3" style={{ backgroundColor: 'rgba(10,10,10,0.86)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #17171a' }}>
          <Link href="/feed" className="font-display text-[11px] uppercase tracking-widest" style={{ color: '#c4a35a' }}>‹ {t('title')}</Link>
        </header>

        <PostCard post={initialPost} isAdmin={privilege.isAdmin} />

        <Composer parentId={initialPost.id} onPosted={(p) => setReplies((r) => [...r, p])} autoFocus={false} />

        <div>
          {replies.map((r) => <PostCard key={r.id} post={r} isAdmin={privilege.isAdmin} onDelete={(id) => setReplies((rs) => rs.filter((x) => x.id !== id))} />)}
        </div>
        <div style={{ height: 80 }} />
      </div>
    </main>
  );
}
