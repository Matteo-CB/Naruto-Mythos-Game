import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const TRACKER_USERS = ['Kutxyt', 'admin', 'Andy'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

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
    const id = searchParams.get('id');

    // Single issue fetch
    if (id) {
      const issue = await prisma.cardIssue.findUnique({ where: { id } });
      if (!issue) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ issue });
    }

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

// POST — create a new card issue (supports multiple cards)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { cardIds, cardNames, description } = body;

    if (!cardIds || !cardNames || !description || !Array.isArray(cardIds) || cardIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const issue = await prisma.cardIssue.create({
      data: {
        cardIds,
        cardNames,
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

// PATCH — update issue status, description, or add/remove cards
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, description, addCardId, addCardName, removeCardIndex } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing issue id' }, { status: 400 });
    }

    // Add a card to existing issue
    if (addCardId && addCardName) {
      const existing = await prisma.cardIssue.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
      }
      const issue = await prisma.cardIssue.update({
        where: { id },
        data: {
          cardIds: { push: addCardId },
          cardNames: { push: addCardName },
          updatedBy: session!.user!.name!,
        },
      });
      return NextResponse.json({ issue });
    }

    // Remove a card by index from existing issue
    if (removeCardIndex !== undefined && typeof removeCardIndex === 'number') {
      const existing = await prisma.cardIssue.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
      }
      if (existing.cardIds.length <= 1) {
        return NextResponse.json({ error: 'Cannot remove last card from issue. Delete the issue instead.' }, { status: 400 });
      }
      const newCardIds = existing.cardIds.filter((_, i) => i !== removeCardIndex);
      const newCardNames = existing.cardNames.filter((_, i) => i !== removeCardIndex);
      const issue = await prisma.cardIssue.update({
        where: { id },
        data: {
          cardIds: newCardIds,
          cardNames: newCardNames,
          updatedBy: session!.user!.name!,
        },
      });
      return NextResponse.json({ issue });
    }

    // Standard update: status / description
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

// DELETE — remove an issue (tracker users can delete their own reports)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
