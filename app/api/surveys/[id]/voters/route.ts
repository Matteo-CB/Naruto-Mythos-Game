import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/adminGuard';
import type { SurveyAnswers, SurveyQuestion } from '@/lib/surveys/validation';

const ID_RE = /^[0-9a-f]{24}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const survey = await prisma.survey.findUnique({ where: { id } });
  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const questions = (survey.questions ?? []) as unknown as SurveyQuestion[];
  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId: id },
    select: { username: true, answers: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byOption: Record<string, Record<string, string[]>> = {};
  const textAnswers: Record<string, Array<{ username: string; text: string }>> = {};

  for (const q of questions) {
    if (q.type === 'text') {
      textAnswers[q.id] = [];
    } else {
      byOption[q.id] = {};
      for (const o of q.options) byOption[q.id][o.id] = [];
    }
  }

  for (const r of responses) {
    const answers = r.answers as SurveyAnswers;
    for (const q of questions) {
      const val = answers[q.id];
      if (val === undefined) continue;
      if (q.type === 'text') {
        if (typeof val === 'string' && val) textAnswers[q.id].push({ username: r.username, text: val });
      } else if (Array.isArray(val)) {
        for (const optId of val) {
          if (byOption[q.id]?.[optId]) byOption[q.id][optId].push(r.username);
        }
      }
    }
  }

  return NextResponse.json({
    responseCount: responses.length,
    byOption,
    textAnswers,
  });
}
