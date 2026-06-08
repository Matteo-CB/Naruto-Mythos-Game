import { Resend } from 'resend';

export type ThankYouLocale = 'fr' | 'en';

export interface ThankYouMailParams {
  to: string;
  amountCents: number;
  recurring: boolean;
  locale: ThankYouLocale;
  recipientName?: string | null;
  managePortalUrl?: string | null;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://narutomythosgame.com';

function formatAmountEur(amountCents: number): string {
  const euros = (amountCents / 100).toFixed(2);
  return `${euros.replace('.', ',')} €`;
}

export function renderThankYouSubject(locale: ThankYouLocale): string {
  return locale === 'fr'
    ? 'Merci pour ton soutien à Naruto Mythos TCG'
    : 'Thanks for supporting Naruto Mythos TCG';
}

export function renderThankYouHtml(params: ThankYouMailParams): string {
  const { amountCents, recurring, locale, recipientName, managePortalUrl } = params;
  const amount = formatAmountEur(amountCents);
  const greeting = recipientName
    ? locale === 'fr'
      ? `Salut ${recipientName},`
      : `Hi ${recipientName},`
    : locale === 'fr'
      ? 'Salut,'
      : 'Hi,';

  const intro = locale === 'fr'
    ? `Merci pour ton ${recurring ? `abonnement de ${amount}/mois` : `don de ${amount}`}. C'est grâce à des soutiens comme le tien que le simulateur peut continuer à grandir.`
    : `Thanks for your ${recurring ? `${amount}/month subscription` : `${amount} donation`}. Supporters like you are why the simulator can keep growing.`;

  const feedback = locale === 'fr'
    ? `Si tu as des questions ou des idées d'amélioration, écris à <a href="mailto:matteo.biyikli3224@gmail.com" style="color:#c4a35a;">matteo.biyikli3224@gmail.com</a> ou poste une suggestion sur <a href="${APP_URL}/fr/help-us" style="color:#c4a35a;">help-us</a>.`
    : `If you have questions or ideas, reach out at <a href="mailto:matteo.biyikli3224@gmail.com" style="color:#c4a35a;">matteo.biyikli3224@gmail.com</a> or post a suggestion at <a href="${APP_URL}/en/help-us" style="color:#c4a35a;">help-us</a>.`;

  const portalBlock = recurring && managePortalUrl
    ? `<p style="text-align: center; color: #888888; font-size: 13px; margin-top: 24px;">
        <a href="${managePortalUrl}" style="color: #c4a35a;">${locale === 'fr' ? 'Gérer ou annuler mon abonnement' : 'Manage or cancel my subscription'}</a>
      </p>`
    : '';

  const signoff = locale === 'fr'
    ? 'A bientôt sur le simulateur.'
    : 'See you on the simulator.';

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
      <p style="text-align: center; color: #555555; font-size: 11px; margin-top: 8px;">L'équipe Naruto Mythos TCG</p>
    </div>
  `;
}

export async function sendDonationThankYouMail(params: ThankYouMailParams): Promise<{ ok: true } | { ok: false; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'no_api_key' };
  }
  const resend = new Resend(apiKey);
  const subject = renderThankYouSubject(params.locale);
  const html = renderThankYouHtml(params);

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
