import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { syncDiscordRole } from '@/lib/discord/roleSync';

function getLocale(request: NextRequest): string {
  // Check NEXT_LOCALE cookie first (set by next-intl)
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale === 'en' || cookieLocale === 'fr') return cookieLocale;
  // Fallback: check Accept-Language header
  const acceptLang = request.headers.get('accept-language') || '';
  if (acceptLang.startsWith('fr')) return 'fr';
  return 'en';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = getLocale(request);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      return redirectWithError(request, 'Missing code or state');
    }

    // Decode state to get userId
    let userId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      userId = decoded.userId;
      // Reject states older than 10 minutes
      if (Date.now() - decoded.ts > 10 * 60 * 1000) {
        return redirectWithError(request, 'Link expired');
      }
    } catch {
      return redirectWithError(request, 'Invalid state');
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, discordId: true },
    });

    if (!user) {
      return redirectWithError(request, 'User not found');
    }

    if (user.discordId) {
      return redirectWithError(request, 'Discord already linked');
    }

    // Exchange code for access token
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/user/link-discord/callback`;

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return redirectWithError(request, 'Discord token exchange failed');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch Discord user profile
    const profileRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return redirectWithError(request, 'Failed to fetch Discord profile');
    }

    const discordProfile = await profileRes.json();
    const discordId = discordProfile.id as string;
    const discordUsername = discordProfile.username as string;

    // Check if this Discord account is already linked to another user
    const existingLink = await prisma.user.findFirst({
      where: { discordId, id: { not: userId } },
    });

    if (existingLink) {
      return redirectWithError(request, 'Discord account already linked to another user');
    }

    // Link Discord to user
    await prisma.user.update({
      where: { id: userId },
      data: { discordId, discordUsername },
    });

    // Create Account record so Discord login also works for this user
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'discord',
          providerAccountId: discordId,
        },
      },
    });

    if (!existingAccount) {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'discord',
          providerAccountId: discordId,
          access_token: accessToken,
          refresh_token: tokenData.refresh_token ?? undefined,
          expires_at: tokenData.expires_in
            ? Math.floor(Date.now() / 1000) + tokenData.expires_in
            : undefined,
          token_type: tokenData.token_type ?? 'Bearer',
          scope: tokenData.scope ?? 'identify email guilds.join',
        },
      });
    }

    // Sync ELO role
    syncDiscordRole(userId).catch(() => {});

    // Redirect to profile with success (include locale prefix)
    return NextResponse.redirect(`${baseUrl}/${locale}/profile/${user.username}?discord=linked`);
  } catch {
    return redirectWithError(request, 'Internal server error');
  }
}

function redirectWithError(request: NextRequest, error: string) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  const locale = (cookieLocale === 'en' || cookieLocale === 'fr') ? cookieLocale : 'en';
  return NextResponse.redirect(`${baseUrl}/${locale}?discord_error=${encodeURIComponent(error)}`);
}
