import { Resend } from 'resend';
import { createTranslator } from 'next-intl';
import { routing } from '@/lib/i18n/routing';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const safe = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  return (await import(`@/messages/${safe}.json`)).default as Record<string, unknown>;
}

export async function sendResetEmail(email: string, token: string, locale: string = 'en') {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resetUrl = `${APP_URL}/${locale}/reset-password?token=${token}`;

  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'email.passwordReset' }) as unknown as (key: string) => string;

  const subject = t('subject');

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #e0e0e0;">
      <h1 style="color: #c4a35a; font-size: 20px; text-align: center; letter-spacing: 2px; text-transform: uppercase;">
        Naruto Mythos TCG
      </h1>
      <p style="text-align: center; color: #888888; font-size: 14px; margin-top: 24px;">
        ${t('intro')}
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: #c4a35a; color: #0a0a0a; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">
          ${t('button')}
        </a>
      </div>
      <p style="text-align: center; color: #555555; font-size: 12px;">
        ${t('expiry')}
      </p>
      <p style="text-align: center; color: #555555; font-size: 12px;">
        ${t('ignore')}
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: 'Naruto Mythos <noreply@narutomythosgame.com>',
    to: email,
    subject,
    html,
  });

  if (error) {
    console.error('Failed to send reset email:', error);
    throw new Error('Failed to send reset email');
  }
}
