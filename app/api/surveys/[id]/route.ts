import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/adminGuard';

const ID_RE = /^[0-9a-f]{24}$/i;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const action = body.action;
  if (action !== 'close' && action !== 'reopen') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({ where: { id }, select: { id: true } });
  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.survey.update({
    where: { id },
    data: action === 'close'
      ? { status: 'closed', closedAt: new Date() }
      : { status: 'open', closedAt: null },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const survey = await prisma.survey.findUnique({ where: { id }, select: { id: true } });
  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.surveyResponse.deleteMany({ where: { surveyId: id } });
  await prisma.survey.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
