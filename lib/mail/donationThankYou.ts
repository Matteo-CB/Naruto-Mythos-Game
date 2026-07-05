import { Resend } from 'resend';
import { createTranslator } from 'next-intl';
import { routing } from '@/lib/i18n/routing';

export type ThankYouLocale = string;

export interface ThankYouMailParams {
  to: string;
  amountCents: number;
  recurring: boolean;
  locale: ThankYouLocale;
  recipientName?: string | null;
  managePortalUrl?: string | null;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://narutomythosgame.com';
const DISCORD_URL = 'https://discord.gg/BBXVUsU3hn';

type MailTranslator = (key: string, values?: Record<string, string>) => string;

async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const safe = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  return (await import(`@/messages/${safe}.json`)).default as Record<string, unknown>;
}

function mailTranslator(locale: string, messages: Record<string, unknown>): MailTranslator {
  return createTranslator({ locale, messages, namespace: 'email.donationThankYou' }) as unknown as MailTranslator;
}

function formatAmountEur(amountCents: number, bcp47: string): string {
  return new Intl.NumberFormat(bcp47, { style: 'currency', currency: 'EUR' }).format(amountCents / 100);
}

export async function renderThankYouSubject(locale: ThankYouLocale): Promise<string> {
  const messages = await loadMessages(locale);
  const t = mailTranslator(locale, messages);
  return t('subject');
}

export async function renderThankYouHtml(params: ThankYouMailParams): Promise<string> {
  const { amountCents, recurring, locale, recipientName, managePortalUrl } = params;
  const messages = await loadMessages(locale);
  const bcp47 = ((messages._meta as { bcp47?: string } | undefined)?.bcp47) ?? 'en-US';
  const t = mailTranslator(locale, messages);
  const amount = formatAmountEur(amountCents, bcp47);

  const greeting = recipientName ? t('greetingNamed', { name: recipientName }) : t('greeting');
  const intro = recurring ? t('introRecurring', { amount }) : t('introOneTime', { amount });

  const discordLink = `<a href="${DISCORD_URL}" style="color:#c4a35a;">${t('discordLinkLabel')}</a>`;
  const contributeLink = `<a href="${APP_URL}/${locale}/help-us" style="color:#c4a35a;">${t('contributeLinkLabel')}</a>`;
  const feedback = t('feedback', { discordLink, contributeLink });

  const portalBlock = recurring && managePortalUrl
    ? `<p style="text-align: center; color: #888888; font-size: 13px; margin-top: 24px;">
        <a href="${managePortalUrl}" style="color: #c4a35a;">${t('managePortal')}</a>
      </p>`
    : '';

  const signoff = t('signoff');
  const signature = t('signature');

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #e0e0e0;">
      <h1 style="color: #c4a35a; font-size: 20px; text-align: center; letter-spacing: 2px; text-transform: uppercase;">
        Naruto Mythos TCG
      </h1>
      <p style="color: #c0c0c0; font-size: 14px; margin-top: 24px;">${greeting}</p>
      <p style="color: #c0c0c0; font-size: 14px; line-height: 1.6;">${intro}</p>
      <p style="color: #888888; font-size: 13px; line-height: 1.6; margin-top: 24px;">${feedback}</p>
      ${portalBlock}
      <p style="text-align: center; color: #888888; font-size: 13px; margin-top: 32px;">${signoff}</p>
      <p style="text-align: center; color: #555555; font-size: 11px; margin-top: 8px;">${signature}</p>
    </div>
  `;
}

export async function sendDonationThankYouMail(params: ThankYouMailParams): Promise<{ ok: true } | { ok: false; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'no_api_key' };
  }
  const resend = new Resend(apiKey);
  const subject = await renderThankYouSubject(params.locale);
  const html = await renderThankYouHtml(params);

  try {
    const { error } = await resend.emails.send({
      from: 'Naruto Mythos <noreply@narutomythosgame.com>',
      to: params.to,
      subject,
      html,
    });
    if (error) {
      console.error('[donations] thank-you mail error:', error);
      return { ok: false, reason: typeof error === 'string' ? error : 'resend_error' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[donations] thank-you mail threw:', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'exception' };
  }
}
