import { auth } from '@/lib/auth/authOptions';
import { isAdmin } from '@/lib/auth/admins';
import { prisma } from '@/lib/db/prisma';

export interface AdminSession {
  userId: string;
  username: string;
}

export interface ModeratorSession extends AdminSession {
  isAdmin: boolean;
}

export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (!isAdmin({ username: session.user.name, email: session.user.email })) return null;
  return { userId: session.user.id, username: session.user.name ?? 'admin' };
}

export async function requireModerator(): Promise<ModeratorSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (isAdmin({ username: session.user.name, email: session.user.email })) {
    return { userId: session.user.id, username: session.user.name ?? 'admin', isAdmin: true };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, username: true },
  });
  if (user?.role !== 'moderator') return null;
  return { userId: session.user.id, username: user.username ?? session.user.name ?? 'moderator', isAdmin: false };
}
