import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_USERNAMES = ['Kutxyt', 'admin'];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ canAccess: false });
    }

    const settings = await prisma.siteSettings.findUnique({
      where: { key: 'global' },
    });

    // If draft is enabled globally, everyone can access
    if (settings?.draftEnabled) {
      return NextResponse.json({ canAccess: true });
    }

    // Otherwise, only testers and admins
    const username = session.user.name;
    if (username && ADMIN_USERNAMES.includes(username)) {
      return NextResponse.json({ canAccess: true });
    }

    const role = (session.user as unknown as Record<string, unknown>).role as string | undefined;
    if (role === 'tester' || role === 'admin') {
      return NextResponse.json({ canAccess: true });
    }

    return NextResponse.json({ canAccess: false });
  } catch {
    return NextResponse.json({ canAccess: false });
  }
}
