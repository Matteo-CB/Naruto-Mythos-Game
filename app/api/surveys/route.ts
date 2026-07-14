import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/adminGuard';
import {
  parseSurveyQuestions,
  aggregateResults,
  SURVEY_LIMITS,
  type SurveyQuestion,
  type SurveyAnswers,
} from '@/lib/surveys/validation';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const surveys = await prisma.survey.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const myResponses = userId
    ? await prisma.surveyResponse.findMany({
        where: { userId, surveyId: { in: surveys.map((s) => s.id) } },
        select: { surveyId: true, answers: true },
      })
    : [];
  const myBySurvey = new Map(myResponses.map((r) => [r.surveyId, r.answers as SurveyAnswers]));

  const resultSurveyIds = surveys
    .filter((s) => (s.status === 'closed' || myBySurvey.has(s.id)) && s.responseCount > 0)
    .map((s) => s.id);
  const allResponses = resultSurveyIds.length > 0
    ? await prisma.surveyResponse.findMany({
        where: { surveyId: { in: resultSurveyIds } },
        select: { surveyId: true, answers: true },
      })
    : [];
  const responsesBySurvey = new Map<string, SurveyAnswers[]>();
  for (const r of allResponses) {
    const list = responsesBySurvey.get(r.surveyId) ?? [];
    list.push(r.answers as SurveyAnswers);
    responsesBySurvey.set(r.surveyId, list);
  }

  const out = [];
  for (const s of surveys) {
    const questions = (s.questions ?? []) as unknown as SurveyQuestion[];
    const myAnswers = myBySurvey.get(s.id) ?? null;

    let results: Record<string, Record<string, number>> | null = null;
    const grouped = responsesBySurvey.get(s.id);
    if (grouped) {
      results = aggregateResults(questions, grouped);
    }

    out.push({
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      closedAt: s.closedAt ? s.closedAt.toISOString() : null,
      questions,
      responseCount: s.responseCount,
      myAnswers,
      results,
    });
  }

  return NextResponse.json({ surveys: out });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { title?: unknown; description?: unknown; questions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body', errorKey: 'surveys.error.invalid' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > SURVEY_LIMITS.titleMax) {
    return NextResponse.json({ error: 'Invalid title', errorKey: 'surveys.error.titleRequired' }, { status: 400 });
  }
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, SURVEY_LIMITS.descriptionMax) : '';

  const questions = parseSurveyQuestions(body.questions);
  if (!questions) {
    return NextResponse.json({ error: 'Invalid questions', errorKey: 'surveys.error.invalidQuestions' }, { status: 400 });
  }

  const survey = await prisma.survey.create({
    data: {
      title,
      description: description || null,
      createdBy: admin.userId,
      questions: questions as unknown as object,
    },
  });

  return NextResponse.json({ id: survey.id }, { status: 201 });
}
