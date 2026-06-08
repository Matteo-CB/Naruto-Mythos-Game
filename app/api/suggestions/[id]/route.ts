import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { isAdmin } from '@/lib/auth/admins';
import { prisma } from '@/lib/db/prisma';
import { ADMIN_NOTE_MAX, isStatus } from '@/lib/suggestions/validation';

const CLOSED_STATUSES = new Set(['done', 'rejected']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin({ username: session?.user?.name ?? null, email: session?.user?.email ?? null })) {
    return NextResponse.json({ errorKey: 'helpUs.admin.error.notAdmin' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.notFound' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.invalidCategory' }, { status: 400 });
  }
  const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const data: { status?: string; adminNote?: string | null; closedAt?: Date | null } = {};

  if (obj.status !== undefined) {
    if (!isStatus(obj.status)) {
      return NextResponse.json({ errorKey: 'helpUs.suggestions.error.invalidCategory' }, { status: 400 });
    }
    data.status = obj.status;
    data.closedAt = CLOSED_STATUSES.has(obj.status) ? new Date() : null;
  }

  if (obj.adminNote !== undefined) {
    if (obj.adminNote === null || obj.adminNote === '') {
      data.adminNote = null;
    } else if (typeof obj.adminNote === 'string') {
      const trimmed = obj.adminNote.normalize('NFC').trim();
      if (trimmed.length > ADMIN_NOTE_MAX) {
        return NextResponse.json({ errorKey: 'helpUs.suggestions.error.tooLong' }, { status: 400 });
      }
      data.adminNote = trimmed;
    } else {
      return NextResponse.json({ errorKey: 'helpUs.suggestions.error.tooLong' }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.invalidCategory' }, { status: 400 });
  }

  const existing = await prisma.suggestion.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.notFound' }, { status: 404 });
  }

  const updated = await prisma.suggestion.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    id: updated.id,
    userId: updated.userId,
    username: updated.username,
    category: updated.category,
    title: updated.title,
    body: updated.body,
    status: updated.status,
    voteCount: updated.voteCount,
    adminNote: updated.adminNote,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    closedAt: updated.closedAt ? updated.closedAt.toISOString() : null,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin({ username: session?.user?.name ?? null, email: session?.user?.email ?? null })) {
    return NextResponse.json({ errorKey: 'helpUs.admin.error.notAdmin' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.notFound' }, { status: 404 });
  }

  const existing = await prisma.suggestion.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.notFound' }, { status: 404 });
  }

  await prisma.suggestion.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
