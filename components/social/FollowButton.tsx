'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';

export function FollowButton({
  targetId,
  initialFollowing,
  onChange,
}: {
  targetId: string;
  initialFollowing?: boolean;
  onChange?: (following: boolean) => void;
}) {
  const t = useTranslations('social');
  const { data: session } = useSession();
  const [following, setFollowing] = useState(!!initialFollowing);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (initialFollowing !== undefined) {
      setFollowing(initialFollowing);
    }
  }, [initialFollowing]);

  if (!session?.user?.id || session.user.id === targetId) return null;

  const toggle = async () => {
    if (busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next);
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, follow: next }),
      });
      if (!res.ok) {
        setFollowing(!next);
      } else {
        const d = await res.json();
        setFollowing(!!d.following);
        onChange?.(!!d.following);
      }
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  };

  const label = following ? (hover ? t('unfollow') : t('following')) : t('follow');

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={busy}
      className="font-display text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors"
      style={{
        backgroundColor: following ? 'rgba(136,136,136,0.08)' : 'var(--t-accent-glow)',
        color: following ? (hover ? 'var(--t-danger)' : 'var(--t-muted)') : 'var(--t-accent)',
        opacity: busy ? 0.5 : 1,
        cursor: busy ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}
