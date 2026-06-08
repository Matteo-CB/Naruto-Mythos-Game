'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

const ACCENT = '#c4a35a';
const TITLE_MAX = 140;
const BODY_MAX = 2000;
const TITLE_MIN = 5;
const BODY_MIN = 20;

const CATEGORIES = ['bug', 'feature', 'balance', 'ui', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { category: Category; title: string; body: string }) => Promise<{ ok: boolean; errorKey?: string }>;
}

export function SuggestionFormModal({ open, onClose, onSubmit }: Props) {
  const t = useTranslations('helpUs.suggestions');
  const tCommon = useTranslations('common');

  const [category, setCategory] = useState<Category>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const dirty = title.trim().length > 0 || body.trim().length > 0;
  const trimmedTitle = title.normalize('NFC').trim();
  const trimmedBody = body.normalize('NFC').trim();
  const valid = trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX
    && trimmedBody.length >= BODY_MIN && trimmedBody.length <= BODY_MAX;

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => titleRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseRequest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.style.height = 'auto';
    bodyRef.current.style.height = `${Math.min(320, bodyRef.current.scrollHeight)}px`;
  }, [body]);

  const reset = useCallback(() => {
    setCategory('bug');
    setTitle('');
    setBody('');
    setSubmitting(false);
    setConfirmCloseOpen(false);
  }, []);

  const handleCloseRequest = useCallback(() => {
    if (submitting) return;
    if (dirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose();
    reset();
  }, [dirty, submitting, onClose, reset]);

  const handleDiscard = useCallback(() => {
    setConfirmCloseOpen(false);
    onClose();
    reset();
  }, [onClose, reset]);

  const handleSubmit = useCallback(async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    const result = await onSubmit({ category, title: trimmedTitle, body: trimmedBody });
    if (result.ok) {
      onClose();
      reset();
    } else {
      setSubmitting(false);
    }
  }, [valid, submitting, onSubmit, category, trimmedTitle, trimmedBody, onClose, reset]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="suggestion-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: Z_APP_MODAL }}
          onClick={handleCloseRequest}
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggestion-form-title"
        >
          <motion.div
            key="suggestion-modal-panel"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-xl max-h-[100dvh] sm:max-h-[85vh] flex flex-col overflow-hidden sm:rounded-lg"
            style={{
              backgroundColor: '#111111',
            }}
          >
            <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #1f1f1f' }}>
              <h2
                id="suggestion-form-title"
                className="font-display text-lg tracking-widest uppercase"
                style={{ color: ACCENT }}
              >
                {t('form.title')}
              </h2>
              <button
                type="button"
                onClick={handleCloseRequest}
                className="font-display uppercase text-xs tracking-widest transition-colors"
                style={{ color: '#888' }}
                aria-label={t('form.close')}
              >
                {t('form.close')}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-body text-xs uppercase tracking-widest" style={{ color: '#888' }}>
                  {t('form.categoryLabel')}
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: '#e8e8e8',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`category.${c}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-body text-xs uppercase tracking-widest" style={{ color: '#888' }}>
                  {t('form.titleLabel')}
                </span>
                <input
                  ref={titleRef}
                  type="text"
                  maxLength={TITLE_MAX + 20}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('form.titlePlaceholder')}
                  className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: '#e8e8e8',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                />
                <span
                  className="text-[11px] font-body self-end"
                  aria-live="polite"
                  style={{ color: trimmedTitle.length > TITLE_MAX ? '#d47f7f' : '#666' }}
                >
                  {trimmedTitle.length} / {TITLE_MAX}
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-body text-xs uppercase tracking-widest" style={{ color: '#888' }}>
                  {t('form.bodyLabel')}
                </span>
                <textarea
                  ref={bodyRef}
                  rows={5}
                  maxLength={BODY_MAX + 50}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('form.bodyPlaceholder')}
                  className="px-3 py-2.5 rounded-md font-body text-sm leading-relaxed focus:outline-none resize-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: '#e8e8e8',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                />
                <span
                  className="text-[11px] font-body self-end"
                  aria-live="polite"
                  style={{ color: trimmedBody.length > BODY_MAX ? '#d47f7f' : '#666' }}
                >
                  {trimmedBody.length} / {BODY_MAX}
                </span>
              </label>
            </div>

            <footer className="flex items-center justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid #1f1f1f' }}>
              <button
                type="button"
                onClick={handleCloseRequest}
                disabled={submitting}
                className="font-display uppercase text-xs tracking-widest px-4 py-2.5 rounded-md transition-opacity"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: '#e8e8e8',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!valid || submitting}
                className="font-display uppercase text-xs tracking-widest px-5 py-2.5 rounded-md transition-opacity"
                style={{
                  backgroundColor: ACCENT,
                  color: '#0a0a0a',
                  opacity: !valid || submitting ? 0.5 : 1,
                  cursor: !valid ? 'not-allowed' : submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? t('form.submitting') : t('form.submit')}
              </button>
            </footer>
          </motion.div>

          <AnimatePresence>
            {confirmCloseOpen && (
              <motion.div
                key="confirm-close"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="fixed inset-0 flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: Z_APP_MODAL + 1 }}
                onClick={() => setConfirmCloseOpen(false)}
              >
                <motion.div
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-sm w-full rounded-lg p-5 flex flex-col gap-4"
                  style={{ backgroundColor: '#141414' }}
                >
                  <h3 className="font-display text-base tracking-wider uppercase" style={{ color: ACCENT }}>
                    {t('form.confirmClose')}
                  </h3>
                  <p className="font-body text-sm" style={{ color: '#bbbbbb' }}>
                    {t('form.confirmCloseBody')}
                  </p>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmCloseOpen(false)}
                      className="font-display uppercase text-xs tracking-widest px-3 py-2 rounded-md"
                      style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#e8e8e8' }}
                    >
                      {t('form.confirmKeep')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscard}
                      className="font-display uppercase text-xs tracking-widest px-3 py-2 rounded-md"
                      style={{ backgroundColor: 'rgba(212,127,127,0.18)', color: '#d47f7f' }}
                    >
                      {t('form.confirmDiscard')}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
