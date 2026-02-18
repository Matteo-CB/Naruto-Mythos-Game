import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'accepted' },
          { receiverId: userId, status: 'accepted' },
        ],
      },
      include: {
        sender: { select: { id: true, username: true, elo: true } },
        receiver: { select: { id: true, username: true, elo: true } },
      },
    });

    const friends = friendships.map((f) => {
      const other = f.senderId === userId ? f.receiver : f.sender;
      return {
        id: other.id,
        username: other.username,
        elo: other.elo,
        friendshipId: f.id,
        since: f.updatedAt,
      };
    });

    return NextResponse.json({ friends });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
