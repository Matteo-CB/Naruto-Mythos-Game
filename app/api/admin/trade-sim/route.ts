import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { getVariantInventory } from '@/lib/variants/inventory';
import { validateOffer } from '@/lib/trade/inventory-rules';
import { decrementVariant, incrementVariant } from '@/lib/variants/inventory';
import { userOwnsOffer } from '@/lib/trade/validation';

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, email: true } });
  return isAdmin({ username: u?.username, email: u?.email });
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get('username') ?? '').trim();
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const inventory = await getVariantInventory(user.id);
  return NextResponse.json({ userId: user.id, username: user.username, inventory });
}

interface ExecBody {
  userAId?: unknown;
  userBId?: unknown;
  offerA?: unknown;
  offerB?: unknown;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: ExecBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const userAId = typeof body.userAId === 'string' ? body.userAId : '';
  const userBId = typeof body.userBId === 'string' ? body.userBId : '';
  const offerA = Array.isArray(body.offerA) ? body.offerA.filter((c): c is string => typeof c === 'string') : [];
  const offerB = Array.isArray(body.offerB) ? body.offerB.filter((c): c is string => typeof c === 'string') : [];
  if (!userAId || !userBId || userAId === userBId) {
    return NextResponse.json({ error: 'Invalid users' }, { status: 400 });
  }

  const offerCheck = validateOffer(offerA, offerB);
  if (!offerCheck.valid) {
    return NextResponse.json({ error: 'Invalid offer', reason: offerCheck.reason }, { status: 400 });
  }
  if (!(await userOwnsOffer(userAId, offerA)) || !(await userOwnsOffer(userBId, offerB))) {
    return NextResponse.json({ error: 'Insufficient' }, { status: 409 });
  }

  const decremented: Array<{ userId: string; cardId: string }> = [];
  const tryDec = async (userId: string, cardId: string) => {
    const ok = await decrementVariant(userId, cardId);
    if (ok) decremented.push({ userId, cardId });
    return ok;
  };
  const rollback = async () => {
    for (const d of decremented) await incrementVariant(d.userId, d.cardId);
  };

  for (const c of offerA) {
    if (!(await tryDec(userAId, c))) { await rollback(); return NextResponse.json({ error: 'Insufficient' }, { status: 409 }); }
  }
  for (const c of offerB) {
    if (!(await tryDec(userBId, c))) { await rollback(); return NextResponse.json({ error: 'Insufficient' }, { status: 409 }); }
  }
  for (const c of offerA) await incrementVariant(userBId, c);
  for (const c of offerB) await incrementVariant(userAId, c);

  await prisma.tradeLog.create({
    data: {
      tradeRoomId: 'admin-sim',
      senderId: userAId,
      receiverId: userBId,
      senderCards: offerA,
      receiverCards: offerB,
    },
  });

  return NextResponse.json({ ok: true });
}
