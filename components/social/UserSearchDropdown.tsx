'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSocialStore } from '@/stores/socialStore';
import { FriendshipButton } from './FriendshipButton';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';

interface UserSearchDropdownProps {
  namespace?: string;
}

export function UserSearchDropdown({ namespace }: UserSearchDropdownProps) {
  const t = useTranslations('friends');
  const searchUsers = useSocialStore((s) => s.searchUsers);
  const searchResults = useSocialStore((s) => s.searchResults);
  const searchLoading = useSocialStore((s) => s.searchLoading);
  const clearSearch = useSocialStore((s) => s.clearSearch);

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!value.trim()) {
        clearSearch();
        setIsOpen(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        searchUsers(value);
        setIsOpen(true);
      }, 300);
    },
    [searchUsers, clearSearch],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (query.trim() && (searchResults.length > 0 || searchLoading)) {
      setIsOpen(true);
    }
  }, [searchResults, searchLoading, query]);

  const showNoResults =
    !searchLoading && searchResults.length === 0 && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative" style={{ maxWidth: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => {
          if (query.trim() && (searchResults.length > 0 || searchLoading)) {
            setIsOpen(true);
          }
        }}
        placeholder={t('search.placeholder')}
        className="w-full h-10 px-3 text-sm"
        style={{
          backgroundColor: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 6,
          color: 'var(--t-text)',
          outline: 'none',
        }}
      />

      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1"
          style={{
            backgroundColor: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 6,
            maxHeight: 300,
            overflowY: 'auto',
            zIndex: 50,
            boxShadow: '0 8px 24px var(--t-shadow)',
          }}
        >
          {searchLoading && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: 'var(--t-dim)' }}
            >
              {t('search.searching')}
            </div>
          )}

          {!searchLoading && showNoResults && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: 'var(--t-dim)' }}
            >
              {t('search.noResults')}
            </div>
          )}

          {!searchLoading &&
            searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between px-4 py-3"
                style={{
                  borderBottom: '1px solid var(--t-surface-2)',
                }}
              >
                <div className="flex items-center gap-3">
                  <PlayerNameLink
                    username={user.username}
                    className="text-sm font-medium"
                    style={{ color: 'var(--t-text)' }}
                  />
                  <span
                    className="text-xs px-2 py-0.5"
                    style={{
                      backgroundColor: 'var(--t-accent-glow)',
                      border: '1px solid rgba(196, 163, 90, 0.25)',
                      borderRadius: 4,
                      color: 'var(--t-accent)',
                    }}
                  >
                    {user.elo}
                  </span>
                </div>
                <FriendshipButton userId={user.id} username={user.username} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
