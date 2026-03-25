import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isDiscordMember } from '@/lib/discord/tournamentRoles';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ isMember: false, reason: 'not-authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { discordId: true },
  });

  if (!user?.discordId) {
    return NextResponse.json({ isMember: false, reason: 'not-linked' });
  }

  const isMember = await isDiscordMember(user.discordId);
  return NextResponse.json({ isMember, reason: isMember ? null : 'not-in-server' });
}
