import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { validateSurveyAnswers, type SurveyQuestion } from '@/lib/surveys/validation';
import { Prisma } from '@prisma/client';

const ID_RE = /^[0-9a-f]{24}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { answers?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body', errorKey: 'surveys.error.invalid' }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({ where: { id } });
  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (survey.status !== 'open') {
    return NextResponse.json({ error: 'Survey closed', errorKey: 'surveys.error.closed' }, { status: 409 });
  }

  const questions = (survey.questions ?? []) as unknown as SurveyQuestion[];
  const answers = validateSurveyAnswers(questions, body.answers);
  if (!answers) {
    return NextResponse.json({ error: 'Invalid answers', errorKey: 'surveys.error.invalidAnswers' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  try {
    await prisma.surveyResponse.create({
      data: {
        surveyId: id,
        userId: session.user.id,
        username: user.username,
        answers: answers as unknown as object,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Already voted', errorKey: 'surveys.error.alreadyVoted' }, { status: 409 });
    }
    throw err;
  }

  await prisma.survey.update({
    where: { id },
    data: { responseCount: { increment: 1 } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
