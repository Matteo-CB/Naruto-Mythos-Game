import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';
import { getThread } from '@/lib/social/posts';
import type { PostView } from '@/lib/social/types';
import { PostThreadClient } from './PostThreadClient';

const SITE_URL = 'https://narutomythosgame.com';

type Props = { params: Promise<{ locale: string; postId: string }> };

function snippet(post: PostView, fallback: string): string {
  if (post.body) return post.body.slice(0, 160);
  if (post.deck) return post.deck.name;
  if (post.replay) return `${post.replay.player1Name} vs ${post.replay.player2Name}`;
  return fallback;
}

function isEmptyOrRemoved(post: PostView): boolean {
  return !post.body && !post.deck && !post.replay && !post.gifUrl && !post.repostOf;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, postId } = await params;
  const thread = await getThread(null, postId).catch(() => null);
  if (!thread) return { robots: { index: false, follow: false } };

  const post = thread.post;
  const author = post.author?.username ?? '?';
  const t = await getTranslations({ locale, namespace: 'seoPages.postDetail' });
  const desc = snippet(post, t('fallbackSnippet'));
  const title = t('title', { author, snippet: desc.slice(0, 70) });
  const description = t('description', { author, snippet: desc });

  // Replies and removed posts are not indexed; a reply canonicalizes to its parent thread.
  const noindex = isEmptyOrRemoved(post) || !!post.parentId;
  const canonicalId = post.parentId ?? post.id;
  const url = `${SITE_URL}/${locale}/feed/${canonicalId}`;
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/feed/${canonicalId}`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/feed/${canonicalId}`;

  return {
    title,
    description,
    robots: noindex ? { index: false, follow: true } : undefined,
    alternates: { canonical: url, languages },
    openGraph: { title, description, url, type: 'article', images: [{ url: `${SITE_URL}/images/og-image.webp?v=3` }] },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PostDetailPage({ params }: Props) {
  const { locale, postId } = await params;
  setRequestLocale(locale);
  const thread = await getThread(null, postId).catch(() => null);
  if (!thread) notFound();

  const post = thread.post;
  const author = post.author?.username ?? '?';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    url: `${SITE_URL}/${locale}/feed/${post.id}`,
    datePublished: post.createdAt,
    author: { '@type': 'Person', name: author },
    articleBody: post.body || undefined,
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: post.likeCount },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: post.replyCount },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ShareAction', userInteractionCount: post.repostCount },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PostThreadClient initialPost={post} initialReplies={thread.replies} />
    </>
  );
}
