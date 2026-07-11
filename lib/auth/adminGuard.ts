import { auth } from '@/lib/auth/authOptions';
import { isAdmin } from '@/lib/auth/admins';

export interface AdminSession {
  userId: string;
  username: string;
}

export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (!isAdmin({ username: session.user.name, email: session.user.email })) return null;
  return { userId: session.user.id, username: session.user.name ?? 'admin' };
}
