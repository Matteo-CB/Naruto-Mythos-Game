import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const testers = await prisma.user.findMany({
      where: { role: 'tester' },
      select: { id: true, username: true, elo: true },
      orderBy: { username: 'asc' },
    });

    return NextResponse.json({ testers });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { username, action } = body as { username: string; action: 'add' | 'remove' };

    if (!username || !['add', 'remove'].includes(action)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'add') {
      if (user.role === 'admin') {
        return NextResponse.json({ error: 'Cannot change admin role' }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'tester' },
      });
    } else {
      if (user.role !== 'tester') {
        return NextResponse.json({ error: 'User is not a tester' }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'user' },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
