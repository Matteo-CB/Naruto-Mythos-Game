import { Resend } from 'resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://narutomythosgame.com';

export async function sendVerifyEmail(email: string, token: string, locale: string = 'en'): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const verifyUrl = `${APP_URL}/${locale}/auth/verify-email?token=${token}`;

  const isEn = locale === 'en';

  const subject = isEn
    ? 'Naruto Mythos - Verify your email'
    : 'Naruto Mythos - Verifie ton email';

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #e0e0e0;">
      <h1 style="color: #c4a35a; font-size: 20px; text-align: center; letter-spacing: 2px; text-transform: uppercase;">
        Naruto Mythos TCG
      </h1>
      <p style="text-align: center; color: #888888; font-size: 14px; margin-top: 24px;">
        ${isEn ? 'Welcome! Confirm your email to unlock the simulator.' : 'Bienvenue ! Confirme ton email pour debloquer le simulateur.'}
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 32px; background: #c4a35a; color: #0a0a0a; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">
          ${isEn ? 'Verify Email' : 'Verifier mon email'}
        </a>
      </div>
      <p style="text-align: center; color: #555555; font-size: 12px;">
        ${isEn ? 'This link expires in 24 hours.' : 'Ce lien expire dans 24 heures.'}
      </p>
      <p style="text-align: center; color: #555555; font-size: 12px;">
        ${isEn ? 'If you did not create this account, you can ignore this email.' : 'Si tu n\'as pas cree ce compte, tu peux ignorer cet email.'}
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
    console.error('[sendVerifyEmail] failed:', error);
    throw new Error('Failed to send verify email');
  }
}
