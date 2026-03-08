import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const TRACKER_USERS = ['Kutxyt', 'admin', 'Andy'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin'];

function isAuthorized(name: string | null | undefined): boolean {
  return !!name && TRACKER_USERS.includes(name);
}

function isAdmin(name: string | null | undefined): boolean {
  return !!name && ADMIN_USERNAMES.includes(name);
}

// GET — list all card issues
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const where = status && status !== 'all' ? { status } : {};
    const issues = await prisma.cardIssue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ issues });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — create a new card issue
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { cardId, cardName, description } = body;

    if (!cardId || !cardName || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const issue = await prisma.cardIssue.create({
      data: {
        cardId,
        cardName,
        description,
        status: 'to_fix',
        reportedBy: session!.user!.name!,
      },
    });

    return NextResponse.json({ issue });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH — update issue status or description
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing issue id' }, { status: 400 });
    }

    const updateData: Record<string, string> = {};
    if (status) updateData.status = status;
    if (description !== undefined) updateData.description = description;
    updateData.updatedBy = session!.user!.name!;

    const issue = await prisma.cardIssue.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ issue });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — remove an issue (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAdmin(session?.user?.name)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing issue id' }, { status: 400 });
    }

    await prisma.cardIssue.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
