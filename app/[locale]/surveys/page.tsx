'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { Footer } from '@/components/Footer';
import { isAdmin as isAdminUser } from '@/lib/auth/admins';
import { SURVEY_LIMITS, type SurveyQuestion, type SurveyAnswers } from '@/lib/surveys/validation';
import { markSurveysSeen } from '@/lib/surveys/seen';
import { clearSurveysBadgeCache } from '@/lib/surveys/badgeCache';

const ACCENT = 'var(--t-accent)';

interface SurveyDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
  questions: SurveyQuestion[];
  responseCount: number;
  myAnswers: SurveyAnswers | null;
  results: Record<string, Record<string, number>> | null;
}

interface VotersDto {
  responseCount: number;
  byOption: Record<string, Record<string, string[]>>;
  textAnswers: Record<string, Array<{ username: string; text: string }>>;
}

interface DraftQuestion {
  type: 'single' | 'multiple' | 'text';
  text: string;
  options: string[];
}

function ResultBar({ label, count, total, mine }: { label: string; count: number; total: number; mine: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="relative overflow-hidden" style={{ backgroundColor: 'var(--t-surface)' }}>
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${pct}%`, backgroundColor: mine ? `${ACCENT}38` : `${ACCENT}1c`, transition: 'width 400ms ease' }}
      />
      <div className="relative flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-sm" style={{ color: mine ? ACCENT : 'var(--t-text)' }}>{label}</span>
        <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--t-muted)' }}>{pct}% ({count})</span>
      </div>
    </div>
  );
}

function SurveyCard({
  survey,
  loggedIn,
  admin,
  onRefresh,
}: {
  survey: SurveyDto;
  loggedIn: boolean;
  admin: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('surveys');
  const [draft, setDraft] = useState<Record<string, string[] | string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voters, setVoters] = useState<VotersDto | null>(null);
  const [votersOpen, setVotersOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  const isOpen = survey.status === 'open';
  const hasVoted = survey.myAnswers !== null;
  const showResults = survey.results !== null && (hasVoted || !isOpen);
  const canVote = loggedIn && isOpen && !hasVoted;

  const toggleChoice = (q: SurveyQuestion, optionId: string) => {
    setDraft((d) => {
      const cur = Array.isArray(d[q.id]) ? (d[q.id] as string[]) : [];
      if (q.type === 'single') return { ...d, [q.id]: [optionId] };
      return { ...d, [q.id]: cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId] };
    });
  };

  const submitVote = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${survey.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answers: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.errorKey === 'string' ? data.errorKey : 'surveys.error.invalid');
        return;
      }
      onRefresh();
    } catch {
      setError('surveys.error.invalid');
    } finally {
      setSubmitting(false);
    }
  };

  const adminAction = async (action: 'close' | 'reopen' | 'delete') => {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      if (action === 'delete') {
        await fetch(`/api/surveys/${survey.id}`, { method: 'DELETE', credentials: 'include' });
      } else {
        await fetch(`/api/surveys/${survey.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action }),
        });
      }
      onRefresh();
    } finally {
      setAdminBusy(false);
      setConfirmDelete(false);
    }
  };

  const loadVoters = async () => {
    if (votersOpen) {
      setVotersOpen(false);
      return;
    }
    setVotersOpen(true);
    if (voters) return;
    try {
      const res = await fetch(`/api/surveys/${survey.id}/voters`, { credentials: 'include' });
      if (res.ok) setVoters(await res.json());
    } catch { /* ignore */ }
  };

  const draftValid = survey.questions.every((q) => {
    if (q.type === 'text') return true;
    const v = draft[q.id];
    return Array.isArray(v) && v.length > 0;
  });

  const tError = (key: string) => {
    const sub = key.replace(/^surveys\./, '');
    return t.has(sub) ? t(sub) : t('error.invalid');
  };

  return (
    <section
      className="p-5 flex flex-col gap-4"
      style={{ backgroundColor: 'var(--t-surface-2)', boxShadow: '0 12px 32px var(--t-shadow)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--t-text)' }}>{survey.title}</h2>
          {survey.description && (
            <p className="text-sm mt-1" style={{ color: 'var(--t-muted)' }}>{survey.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
            style={{
              backgroundColor: isOpen ? `${ACCENT}1f` : 'var(--t-divider)',
              color: isOpen ? ACCENT : 'var(--t-dim)',
            }}
          >
            {isOpen ? t('statusOpen') : t('statusClosed')}
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--t-dim)' }}>
            {t('participants', { count: survey.responseCount })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {survey.questions.map((q) => {
          const myPicks = survey.myAnswers ? survey.myAnswers[q.id] : undefined;
          return (
            <div key={q.id} className="flex flex-col gap-2">
              <p className="text-sm font-bold" style={{ color: 'var(--t-text)' }}>
                {q.text}
                {q.type === 'multiple' && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider font-normal" style={{ color: 'var(--t-dim)' }}>
                    {t('multipleHint')}
                  </span>
                )}
              </p>

              {q.type !== 'text' && showResults && (
                <div className="flex flex-col gap-1.5">
                  {q.options.map((o) => (
                    <ResultBar
                      key={o.id}
                      label={o.label}
                      count={survey.results?.[q.id]?.[o.id] ?? 0}
                      total={survey.responseCount}
                      mine={Array.isArray(myPicks) && myPicks.includes(o.id)}
                    />
                  ))}
                </div>
              )}

              {q.type !== 'text' && !showResults && (
                <div className="flex flex-col gap-1.5">
                  {q.options.map((o) => {
                    const selected = Array.isArray(draft[q.id]) && (draft[q.id] as string[]).includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={!canVote}
                        onClick={() => toggleChoice(q, o.id)}
                        className="flex items-center gap-3 px-3 py-2 text-left transition-colors"
                        style={{
                          backgroundColor: selected ? `${ACCENT}1f` : 'var(--t-surface)',
                          color: selected ? ACCENT : 'var(--t-text)',
                          cursor: canVote ? 'pointer' : 'default',
                          opacity: canVote ? 1 : 0.6,
                        }}
                      >
                        <span
                          aria-hidden
                          className="shrink-0"
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: q.type === 'single' ? '50%' : 2,
                            border: `1px solid ${selected ? ACCENT : 'var(--t-border-strong)'}`,
                            backgroundColor: selected ? ACCENT : 'transparent',
                          }}
                        />
                        <span className="text-sm">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === 'text' && (hasVoted || !isOpen ? (
                <div className="px-3 py-2 text-sm" style={{ backgroundColor: 'var(--t-surface)', color: 'var(--t-muted)' }}>
                  {typeof myPicks === 'string' && myPicks
                    ? <><span style={{ color: 'var(--t-dim)' }}>{t('myAnswer')} </span><span style={{ color: 'var(--t-text)' }}>{myPicks}</span></>
                    : t('textAnswersPrivate')}
                </div>
              ) : (
                <textarea
                  value={typeof draft[q.id] === 'string' ? (draft[q.id] as string) : ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                  disabled={!canVote}
                  maxLength={SURVEY_LIMITS.textAnswerMax}
                  rows={3}
                  placeholder={t('textPlaceholder')}
                  className="px-3 py-2 text-sm w-full resize-y focus:outline-none"
                  style={{ backgroundColor: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-border)' }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {canVote && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={!draftValid || submitting}
            onClick={submitVote}
            className="px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors"
            style={{
              backgroundColor: draftValid ? ACCENT : 'var(--t-surface-2)',
              color: draftValid ? 'var(--t-bg)' : 'var(--t-dim)',
              cursor: draftValid ? 'pointer' : 'default',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {t('vote')}
          </button>
          <span className="text-[11px]" style={{ color: 'var(--t-dim)' }}>{t('finalVoteNote')}</span>
          {error && <span className="text-xs" style={{ color: 'var(--t-danger)' }}>{tError(error)}</span>}
        </div>
      )}

      {!loggedIn && isOpen && (
        <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
          <Link href="/login" style={{ color: ACCENT }}>{t('signInToVote')}</Link>
        </p>
      )}

      {loggedIn && hasVoted && isOpen && (
        <p className="text-[11px] uppercase tracking-wider" style={{ color: '#5a8b5a' }}>{t('voted')}</p>
      )}

      {admin && (
        <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop: '1px solid var(--t-divider)' }}>
          <button
            type="button"
            disabled={adminBusy}
            onClick={() => adminAction(isOpen ? 'close' : 'reopen')}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: 'var(--t-surface)', color: 'var(--t-muted)' }}
          >
            {isOpen ? t('closeSurvey') : t('reopenSurvey')}
          </button>
          <button
            type="button"
            onClick={loadVoters}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: 'var(--t-surface)', color: 'var(--t-muted)' }}
          >
            {t('viewVoters')}
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: 'rgba(179,62,62,0.12)', color: 'var(--t-danger)' }}
            >
              {t('deleteSurvey')}
            </button>
          ) : (
            <button
              type="button"
              disabled={adminBusy}
              onClick={() => adminAction('delete')}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: 'var(--t-danger)', color: 'var(--t-on-danger)' }}
            >
              {t('confirmDelete')}
            </button>
          )}
        </div>
      )}

      {admin && votersOpen && (
        <div className="flex flex-col gap-3 p-3" style={{ backgroundColor: 'var(--t-surface-2)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
            {t('votersTitle')}
          </span>
          {!voters ? (
            <span className="text-xs" style={{ color: 'var(--t-dim)' }}>...</span>
          ) : (
            survey.questions.map((q) => (
              <div key={q.id} className="flex flex-col gap-1.5">
                <span className="text-xs font-bold" style={{ color: 'var(--t-muted)' }}>{q.text}</span>
                {q.type === 'text' ? (
                  (voters.textAnswers[q.id] ?? []).length === 0 ? (
                    <span className="text-xs" style={{ color: 'var(--t-dim)' }}>{t('noVotes')}</span>
                  ) : (
                    (voters.textAnswers[q.id] ?? []).map((a, i) => (
                      <div key={i} className="px-2 py-1.5 text-xs" style={{ backgroundColor: 'var(--t-surface)' }}>
                        <span style={{ color: ACCENT }}>{a.username}</span>
                        <span style={{ color: 'var(--t-muted)' }}> : {a.text}</span>
                      </div>
                    ))
                  )
                ) : (
                  q.options.map((o) => {
                    const names = voters.byOption[q.id]?.[o.id] ?? [];
                    return (
                      <div key={o.id} className="px-2 py-1.5 text-xs" style={{ backgroundColor: 'var(--t-surface)' }}>
                        <span style={{ color: 'var(--t-text)' }}>{o.label}</span>
                        <span style={{ color: 'var(--t-dim)' }}> ({names.length}) : </span>
                        <span style={{ color: 'var(--t-muted)' }}>{names.length > 0 ? names.join(', ') : t('noVotes')}</span>
                      </div>
                    );
                  })
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function CreateSurveyForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations('surveys');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ type: 'single', text: '', options: ['', ''] }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const updateQuestion = (i: number, patch: Partial<DraftQuestion>) => {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  };

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        questions: questions.map((q, i) => ({
          id: `q${i + 1}`,
          type: q.type,
          text: q.text.trim(),
          options: q.type === 'text' ? [] : q.options
            .map((o, j) => ({ id: `o${j + 1}`, label: o.trim() }))
            .filter((o) => o.label),
        })),
      };
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setTitle('');
      setDescription('');
      setQuestions([{ type: 'single', text: '', options: ['', ''] }]);
      setOpen(false);
      onCreated();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-5 py-2 text-xs font-bold uppercase tracking-widest"
        style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT, boxShadow: `0 0 12px ${ACCENT}22` }}
      >
        {t('create')}
      </button>
    );
  }

  const inputStyle = { backgroundColor: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-border)' } as const;

  return (
    <section className="p-5 flex flex-col gap-4" style={{ backgroundColor: 'var(--t-surface-2)', boxShadow: '0 12px 32px var(--t-shadow)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: ACCENT }}>{t('create')}</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>
          {t('cancel')}
        </button>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={SURVEY_LIMITS.titleMax}
        placeholder={t('formTitle')}
        className="px-3 py-2 text-sm w-full focus:outline-none"
        style={inputStyle}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={SURVEY_LIMITS.descriptionMax}
        rows={2}
        placeholder={t('formDescription')}
        className="px-3 py-2 text-sm w-full resize-y focus:outline-none"
        style={inputStyle}
      />

      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-2 p-3" style={{ backgroundColor: 'var(--t-surface-2)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
              {t('questionLabel', { number: i + 1 })}
            </span>
            <select
              value={q.type}
              onChange={(e) => updateQuestion(i, { type: e.target.value as DraftQuestion['type'] })}
              className="px-2 py-1 text-xs focus:outline-none"
              style={inputStyle}
            >
              <option value="single">{t('typeSingle')}</option>
              <option value="multiple">{t('typeMultiple')}</option>
              <option value="text">{t('typeText')}</option>
            </select>
            {questions.length > 1 && (
              <button
                type="button"
                onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                className="ml-auto text-[11px] uppercase tracking-wider"
                style={{ color: 'var(--t-danger)' }}
              >
                {t('removeQuestion')}
              </button>
            )}
          </div>
          <input
            type="text"
            value={q.text}
            onChange={(e) => updateQuestion(i, { text: e.target.value })}
            maxLength={SURVEY_LIMITS.questionTextMax}
            placeholder={t('questionText')}
            className="px-3 py-2 text-sm w-full focus:outline-none"
            style={inputStyle}
          />
          {q.type !== 'text' && (
            <div className="flex flex-col gap-1.5">
              {q.options.map((o, j) => (
                <div key={j} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={o}
                    onChange={(e) => updateQuestion(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                    maxLength={SURVEY_LIMITS.optionLabelMax}
                    placeholder={t('optionPlaceholder', { number: j + 1 })}
                    className="px-3 py-1.5 text-sm flex-1 focus:outline-none"
                    style={inputStyle}
                  />
                  {q.options.length > SURVEY_LIMITS.minOptions && (
                    <button
                      type="button"
                      onClick={() => updateQuestion(i, { options: q.options.filter((_, k) => k !== j) })}
                      className="text-xs px-2"
                      style={{ color: 'var(--t-danger)' }}
                      aria-label={t('removeOption')}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
              {q.options.length < SURVEY_LIMITS.maxOptions && (
                <button
                  type="button"
                  onClick={() => updateQuestion(i, { options: [...q.options, ''] })}
                  className="self-start text-[11px] uppercase tracking-wider"
                  style={{ color: ACCENT }}
                >
                  {t('addOption')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3 flex-wrap">
        {questions.length < SURVEY_LIMITS.maxQuestions && (
          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, { type: 'single', text: '', options: ['', ''] }])}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: 'var(--t-surface)', color: 'var(--t-muted)' }}
          >
            {t('addQuestion')}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={publish}
          className="px-6 py-2 text-xs font-bold uppercase tracking-widest"
          style={{ backgroundColor: ACCENT, color: 'var(--t-bg)', opacity: busy ? 0.6 : 1 }}
        >
          {t('publish')}
        </button>
        {error && <span className="text-xs" style={{ color: 'var(--t-danger)' }}>{t('error.invalid')}</span>}
      </div>
    </section>
  );
}

export default function SurveysPage() {
  const t = useTranslations('surveys');
  const tc = useTranslations();
  const { data: session } = useSession();
  const [surveys, setSurveys] = useState<SurveyDto[]>([]);
  const [loading, setLoading] = useState(true);

  const admin = isAdminUser({ username: session?.user?.name, email: session?.user?.email });
  const loggedIn = !!session?.user?.id;

  const load = useCallback(() => {
    clearSurveysBadgeCache();
    fetch('/api/surveys', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { surveys: [] }))
      .then((data) => setSurveys(Array.isArray(data.surveys) ? data.surveys : []))
      .catch(() => setSurveys([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const newestOpen = surveys.find((s) => s.status === 'open');
    if (newestOpen) markSurveysSeen(newestOpen.createdAt);
  }, [surveys]);

  const openSurveys = surveys.filter((s) => s.status === 'open');
  const closedSurveys = surveys.filter((s) => s.status !== 'open');

  return (
    <main id="main-content" className="min-h-screen relative bg-[var(--t-bg)] flex flex-col">
      <CloudBackground />
      <DecorativeIcons />
      <div className="max-w-3xl mx-auto relative z-10 flex-1 px-4 py-8 w-full flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--t-text)' }}>{t('title')}</h1>
            <p className="text-sm" style={{ color: 'var(--t-muted)' }}>{t('subtitle')}</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-sm"
            style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
          >
            {tc('common.back')}
          </Link>
        </div>

        {admin && <CreateSurveyForm onCreated={load} />}

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--t-dim)' }}>...</p>
        ) : surveys.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--t-dim)' }}>{t('empty')}</p>
        ) : (
          <>
            {openSurveys.map((s) => (
              <SurveyCard key={s.id} survey={s} loggedIn={loggedIn} admin={admin} onRefresh={load} />
            ))}
            {closedSurveys.length > 0 && (
              <div className="mt-2 mb-1 flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--t-border)' }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>{t('closedSection')}</span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--t-border)' }} />
              </div>
            )}
            {closedSurveys.map((s) => (
              <SurveyCard key={s.id} survey={s} loggedIn={loggedIn} admin={admin} onRefresh={load} />
            ))}
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
