import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/auth/adminGuard';

export async function GET() {
  const mod = await requireModerator();
  if (!mod) return NextResponse.json({ admin: false, moderator: false });
  return NextResponse.json({ admin: mod.isAdmin, moderator: true });
}
