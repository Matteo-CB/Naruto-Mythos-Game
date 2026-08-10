'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { DeckEmbed } from './DeckEmbed';
import { ReplayEmbed } from './ReplayEmbed';
import type { PostView } from '@/lib/social/types';

function timeAgo(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  const s = Math.round(diff / 1000);
  if (s < 60) return rtf.format(-s, 'second');
  const m = Math.round(s / 60);
  if (m < 60) return rtf.format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  const d = Math.round(h / 24);
  if (d < 30) return rtf.format(-d, 'day');
  return new Date(iso).toLocaleDateString(locale);
}

function PostBody({ post }: { post: PostView }) {
  return (
    <>
      {post.body && <p className="font-body-force text-sm whitespace-pre-wrap break-words mt-0.5" style={{ color: '#dedcd4', lineHeight: 1.5 }}>{post.body}</p>}
      {post.deck && <DeckEmbed deck={post.deck} />}
      {post.replay && <ReplayEmbed replay={post.replay} />}
      {post.gifUrl && (
        <div className="mt-2 overflow-hidden inline-block" style={{ maxWidth: 320 }}>
          {}
          <img src={post.gifUrl} alt="" style={{ width: '100%', display: 'block' }} loading="lazy" />
        </div>
      )}
    </>
  );
}

export function PostCard({ post, onChange, onDelete, isAdmin, embedded }: {
  post: PostView;
  onChange?: (p: PostView) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
  embedded?: boolean;
}) {
  const t = useTranslations('feed');
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();
  const [liked, setLiked] = useState(post.viewerLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [repostCount, setRepostCount] = useState(post.repostCount);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [pinned, setPinned] = useState(post.pinned);

  const isOwner = session?.user?.id && post.author?.id === session.user.id;
  const author = post.author?.username ?? '?';

  const toggleLike = async () => {
    if (!session?.user?.id) return;
    const next = !liked;
    setLiked(next); setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, { method: 'POST' });
      if (res.ok) { const d = await res.json(); setLiked(d.liked); setLikeCount(d.likeCount); }
      else { setLiked(!next); setLikeCount((c) => c + (next ? -1 : 1)); }
    } catch { setLiked(!next); setLikeCount((c) => c + (next ? -1 : 1)); }
  };

  const repost = async () => {
    if (!session?.user?.id) return;
    setRepostCount((c) => c + 1);
    try {
      const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repostOfId: post.repostOf ? post.repostOf.id : post.id }) });
      if (!res.ok) setRepostCount((c) => c - 1);
    } catch { setRepostCount((c) => c - 1); }
  };

  const report = async () => {
    setMenuOpen(false);
    try { await fetch(`/api/posts/${post.id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); setReported(true); } catch { /* ignore */ }
  };

  const doPin = async () => {
    setMenuOpen(false);
    const next = !pinned; setPinned(next);
    try { const res = await fetch(`/api/posts/${post.id}/pin`, { method: 'POST' }); if (res.ok) { const d = await res.json(); setPinned(d.pinned); } else setPinned(!next); } catch { setPinned(!next); }
  };

  const doDelete = async () => {
    setMenuOpen(false);
    try { const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' }); if (res.ok) onDelete?.(post.id); } catch { /* ignore */ }
  };

  void onChange;

  const inner = post.repostOf ?? post;
  const isRepostWrapper = !!post.repostOf && !post.body;

  return (
    <article className="px-4 py-3" style={{ backgroundColor: embedded ? 'transparent' : 'var(--t-bg)', borderBottom: embedded ? 'none' : '1px solid #17171a', ...(embedded ? { border: '1px solid #1e1e22' } : {}) }}>
      {isRepostWrapper && (
        <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#6a6a70' }}>{t('repostedBy', { user: author })}</div>
      )}
      {pinned && !embedded && (
        <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--t-accent)' }}>{t('pinned')}</div>
      )}

      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {inner.author ? (
              <Link href={`/profile/${inner.author.username}` as '/'} className="font-display text-sm hover:underline" style={{ color: 'var(--t-text)' }}>{inner.author.username}</Link>
            ) : <span className="font-display text-sm" style={{ color: 'var(--t-muted)' }}>?</span>}
            <span className="text-[11px]" style={{ color: '#55555c' }}>· {timeAgo(inner.createdAt, locale)}</span>
            {!embedded && (
              <div className="relative ml-auto">
                <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label={t('more')} className="px-2 text-lg leading-none" style={{ color: '#55555c' }}>⋯</button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid #2a2a30', minWidth: 150 }}>
                      {!isOwner && <MenuItem onClick={report} disabled={reported}>{reported ? t('reported') : t('report')}</MenuItem>}
                      {isOwner && !inner.parentId && <MenuItem onClick={doPin}>{pinned ? t('unpin') : t('pin')}</MenuItem>}
                      {(isOwner || isAdmin) && <MenuItem onClick={doDelete} danger>{t('deleteAction')}</MenuItem>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {embedded ? <PostBody post={inner} /> : (
            <div role="link" tabIndex={-1} onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) return; router.push(`/feed/${inner.id}` as '/'); }} style={{ cursor: 'pointer' }} data-gp>
              <PostBody post={inner} />
            </div>
          )}

          {post.repostOf && post.body && (
            <div className="mt-2"><PostCard post={post.repostOf} embedded /></div>
          )}

          {!embedded && (
            <div className="mt-2.5 flex items-center gap-5">
              <Link href={`/feed/${inner.id}` as '/'} className="flex items-center gap-1.5 text-[12px]" style={{ color: '#6a6a70' }}>
                <span>{t('reply')}</span>{inner.replyCount > 0 && <span className="tabular-nums">{inner.replyCount}</span>}
              </Link>
              <button type="button" onClick={repost} className="flex items-center gap-1.5 text-[12px]" style={{ color: '#6a6a70', cursor: 'pointer' }}>
                <span>{t('repost')}</span>{repostCount > 0 && <span className="tabular-nums">{repostCount}</span>}
              </button>
              <button type="button" onClick={toggleLike} className="flex items-center gap-1.5 text-[12px]" style={{ color: liked ? 'var(--t-accent)' : '#6a6a70', cursor: 'pointer' }}>
                <span>{t('like')}</span>{likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function MenuItem({ onClick, children, danger, disabled }: { onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="text-left px-3 py-2 text-[12px] transition-colors"
      style={{ color: danger ? '#c26a6a' : '#c9c9c9', backgroundColor: 'transparent', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}
