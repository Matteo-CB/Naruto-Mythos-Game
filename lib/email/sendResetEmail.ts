import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

export async function sendResetEmail(email: string, token: string, locale: string = 'en') {
  const resetUrl = `${APP_URL}/${locale}/reset-password?token=${token}`;

  const isEn = locale === 'en';

  const subject = isEn
    ? 'Naruto Mythos — Reset your password'
    : 'Naruto Mythos — Reinitialiser votre mot de passe';

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #e0e0e0;">
      <h1 style="color: #c4a35a; font-size: 20px; text-align: center; letter-spacing: 2px; text-transform: uppercase;">
        Naruto Mythos TCG
      </h1>
      <p style="text-align: center; color: #888888; font-size: 14px; margin-top: 24px;">
        ${isEn ? 'You requested a password reset.' : 'Vous avez demande une reinitialisation de mot de passe.'}
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: #c4a35a; color: #0a0a0a; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">
          ${isEn ? 'Reset Password' : 'Reinitialiser'}
        </a>
      </div>
      <p style="text-align: center; color: #555555; font-size: 12px;">
        ${isEn ? 'This link expires in 1 hour.' : 'Ce lien expire dans 1 heure.'}
      </p>
      <p style="text-align: center; color: #555555; font-size: 12px;">
        ${isEn ? 'If you did not request this, ignore this email.' : 'Si vous n\'avez pas fait cette demande, ignorez cet email.'}
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: 'Naruto Mythos <onboarding@resend.dev>',
    to: email,
    subject,
    html,
  });

  if (error) {
    console.error('Failed to send reset email:', error);
    throw new Error('Failed to send reset email');
  }
}
