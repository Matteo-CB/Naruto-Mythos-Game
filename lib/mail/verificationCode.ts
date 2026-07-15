import { Resend } from 'resend';
import { createTranslator } from 'next-intl';
import { routing } from '@/lib/i18n/routing';

export interface VerificationMailParams {
  to: string;
  code: string;
  locale: string;
}

type MailTranslator = (key: string, values?: Record<string, string>) => string;

async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const safe = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  return (await import(`@/messages/${safe}.json`)).default as Record<string, unknown>;
}

async function mailTranslator(locale: string): Promise<MailTranslator> {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace: 'email.verifyCode' }) as unknown as MailTranslator;
}

export async function renderVerificationHtml(params: VerificationMailParams): Promise<string> {
  const t = await mailTranslator(params.locale);
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #e0e0e0;">
      <h1 style="color: #c4a35a; font-size: 20px; text-align: center; letter-spacing: 2px; text-transform: uppercase;">
        Naruto Mythos TCG
      </h1>
      <p style="color: #c0c0c0; font-size: 14px; margin-top: 24px;">${t('greeting')}</p>
      <p style="color: #c0c0c0; font-size: 14px; line-height: 1.6;">${t('intro')}</p>
      <p style="text-align: center; margin: 28px 0;">
        <span style="display: inline-block; padding: 14px 28px; background: #141414; color: #c4a35a; font-size: 30px; font-weight: bold; letter-spacing: 10px; font-family: monospace;">${params.code}</span>
      </p>
      <p style="color: #888888; font-size: 13px; line-height: 1.6;">${t('expiry')}</p>
      <p style="color: #555555; font-size: 12px; line-height: 1.6; margin-top: 24px;">${t('ignore')}</p>
    </div>
  `;
}

export async function sendVerificationCodeMail(params: VerificationMailParams): Promise<{ ok: true } | { ok: false; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };
  const resend = new Resend(apiKey);
  const t = await mailTranslator(params.locale);
  const html = await renderVerificationHtml(params);

  try {
    const { error } = await resend.emails.send({
      from: 'Naruto Mythos <noreply@narutomythosgame.com>',
      to: params.to,
      subject: t('subject', { code: params.code }),
      html,
    });
    if (error) {
      console.error('[auth] verification mail error:', error);
      return { ok: false, reason: typeof error === 'string' ? error : 'resend_error' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[auth] verification mail threw:', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'exception' };
  }
}
