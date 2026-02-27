import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has Discord linked
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { discordId: true },
    });

    if (user?.discordId) {
      return NextResponse.json({ error: 'Discord already linked' }, { status: 400 });
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: 'Discord not configured' }, { status: 500 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/user/link-discord/callback`;
    const state = Buffer.from(JSON.stringify({ userId: session.user.id, ts: Date.now() })).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email guilds.join',
      state,
    });

    return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
