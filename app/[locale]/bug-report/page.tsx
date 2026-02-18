'use client';

import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { Footer } from '@/components/Footer';

export default function BugReportPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('description', description);
      if (imageFile) formData.append('image', imageFile);

      const res = await fetch('/api/bugs', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setSubmitted(true);
        setDescription('');
        setImageFile(null);
        setImagePreview(null);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!session?.user) {
    return (
      <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: '#0a0a0a' }}>
        <CloudBackground />
        <DecorativeIcons />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-6 max-w-md w-full text-center relative z-10">
            <h1 className="text-2xl font-bold tracking-wider uppercase" style={{ color: '#c4a35a' }}>
              {t('bugReport.title')}
            </h1>
            <p className="text-sm" style={{ color: '#888888' }}>
              {t('bugReport.signInRequired')}
            </p>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
              >
                {t('common.signIn')}
              </Link>
              <Link
                href="/"
                className="px-6 py-2.5 text-sm"
                style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
              >
                {t('common.back')}
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <DecorativeIcons />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="flex flex-col items-center gap-6 max-w-lg w-full relative z-10">
          <h1 className="text-2xl font-bold tracking-wider uppercase" style={{ color: '#c4a35a' }}>
            {t('bugReport.title')}
          </h1>
          <p className="text-xs" style={{ color: '#555555' }}>
            {t('bugReport.subtitle')}
          </p>

          {submitted ? (
            <div
              className="w-full rounded-lg p-8 flex flex-col items-center gap-4"
              style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
            >
              <p className="text-sm font-bold" style={{ color: '#4a9e4a' }}>
                {t('bugReport.success')}
              </p>
              <p className="text-xs" style={{ color: '#888888' }}>
                {t('bugReport.successDesc')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSubmitted(false)}
                  className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
                  style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                >
                  {t('bugReport.submitAnother')}
                </button>
                <Link
                  href="/"
                  className="px-6 py-2.5 text-sm"
                  style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
                >
                  {t('common.back')}
                </Link>
              </div>
            </div>
          ) : (
            <div
              className="w-full rounded-lg p-6 flex flex-col gap-4"
              style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
            >
              {error && (
                <div
                  className="rounded px-4 py-2 text-xs"
                  style={{ backgroundColor: '#1a0a0a', border: '1px solid #b33e3e', color: '#b33e3e' }}
                >
                  {error}
                </div>
              )}

              {/* Description */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#888888' }}>
                  {t('bugReport.descriptionLabel')}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('bugReport.descriptionPlaceholder')}
                  rows={5}
                  className="w-full rounded py-3 px-4 text-sm outline-none resize-none"
                  style={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #262626',
                    color: '#e0e0e0',
                  }}
                />
              </div>

              {/* Image upload */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#888888' }}>
                  {t('bugReport.imageLabel')}
                </label>

                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full max-h-64 object-contain rounded"
                      style={{ border: '1px solid #262626' }}
                    />
                    <button
                      onClick={removeImage}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-xs font-bold"
                      style={{
                        backgroundColor: '#b33e3e',
                        color: '#ffffff',
                      }}
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-8 rounded text-sm flex flex-col items-center gap-2 transition-colors"
                    style={{
                      backgroundColor: '#0a0a0a',
                      border: '1px dashed #333333',
                      color: '#555555',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#c4a35a';
                      (e.currentTarget as HTMLElement).style.color = '#c4a35a';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#333333';
                      (e.currentTarget as HTMLElement).style.color = '#555555';
                    }}
                  >
                    <span className="text-2xl">+</span>
                    <span className="text-xs">{t('bugReport.uploadImage')}</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <p className="text-xs" style={{ color: '#333333' }}>
                  {t('bugReport.imageHint')}
                </p>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!description.trim() || submitting}
                className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: !description.trim() || submitting ? '#333333' : '#c4a35a',
                  color: '#0a0a0a',
                }}
              >
                {submitting ? t('bugReport.submitting') : t('bugReport.submit')}
              </button>
            </div>
          )}

          <Link
            href="/"
            className="px-6 py-2 text-sm transition-colors"
            style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
          >
            {t('auth.backToHome')}
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
